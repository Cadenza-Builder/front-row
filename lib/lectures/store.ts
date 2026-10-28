import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { refused } from "@/lib/billing/plans";
import { indexFiles } from "@/lib/companion/search";
import { finishLecture, processSegment, toMarkdown, type Notes, type Snapshot } from "@/lib/lecture";
import { SOMETHING_WRONG } from "@/lib/runs/startRun";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { notesDocx, notesPdf } from "./export";

// Front Row's Cadenza glue (docs/superpowers/plans/2026-10-27-lecture-notes.md, Task 7). The browser can only read and
// delete its lectures, so every lecture and segment write is the admin client's, with the caller's user_id set and
// filtered, after an RLS read of the lecture, its Front Row course, or (Add to Cadenza) the week. Storage paths are
// always built here: `${userId}/${lectureId}/…`.

type Db = SupabaseClient<Database>;
type Reply = { code: number; body: Record<string, unknown> };
type Segment = Awaited<ReturnType<typeof processSegment>>;
type Lecture = { id: string; lecture_course_id: string; number: number; title: string | null; status: string; file_id: string | null };

const SEG = 120; // seconds per segment, as the recorder cuts them
const MAX_SEGMENTS = 180; // six hours
const STALE_MS = 6 * 60_000; // past maxDuration: a finish still processing after this was killed
const NOT_FOUND: Reply = { code: 404, body: { error: "Lecture not found." } };
const bad = (error: string): Reply => ({ code: 400, body: { error } });

const Create = z.strictObject({ lectureCourseId: z.uuid(), source: z.enum(["phone", "room"]), consent: z.literal(true).optional() });
const Rename = z.strictObject({ title: z.string().trim().min(1).max(200) });
const Link = z.strictObject({ weekId: z.uuid() });
const Frames = z.strictObject({ frames: z.array(z.strictObject({ t: z.number().min(0).max(MAX_SEGMENTS * SEG), changed: z.boolean() })).max(60) });
const Finish = z.strictObject({ segmentCount: z.number().int().min(1).max(MAX_SEGMENTS) });

/** The caller's lecture under RLS, or null (unknown, foreign or not a uuid). */
async function load(supabase: Db, userId: string, id: string): Promise<Lecture | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data } = await supabase.from("lectures").select("id, lecture_course_id, number, title, status, file_id").eq("id", id).eq("user_id", userId).maybeSingle().throwOnError();
  return data;
}

/** The caller's Front Row course under RLS, or null. */
const courseOf = async (supabase: Db, userId: string, id: string) =>
  (await supabase.from("lecture_courses").select("id, name, keywords").eq("id", id).eq("user_id", userId).maybeSingle().throwOnError()).data;

/** Starts a run (daily cap, plan pick) with no week. A refusal the student can act on throws with cause "refused". */
export async function startRun(supabase: Db, kind: "lecture" | "syllabus"): Promise<string> {
  const started = await supabase.rpc("start_run", { p_week_id: null, p_kind: kind });
  if (!started.error) return started.data;
  const msg = started.error.message;
  const told = msg.includes("daily_run_cap") ? "You have hit today's limit, try again tomorrow." : refused(msg)?.error;
  throw told ? new Error(told, { cause: "refused" }) : started.error;
}

/** Every object name in the lecture's folder (a long lecture has over a thousand frames). */
async function listAll(supabase: Db, dir: string) {
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from("lectures").list(dir, { limit: 1000, offset });
    if (error) throw error;
    names.push(...data.map((o) => o.name));
    if (data.length < 1000) return names;
  }
}

export async function createLecture(supabase: Db, userId: string, input: unknown): Promise<Reply> {
  const parsed = Create.safeParse(input);
  if (!parsed.success) return bad("Send a course and a source.");
  const { lectureCourseId, source, consent } = parsed.data;
  if (!(await courseOf(supabase, userId, lectureCourseId))) return { code: 404, body: { error: "Course not found." } };
  const admin = createAdminClient();
  if (consent) {
    // The first agreement is the one kept.
    await admin.from("profiles").update({ recording_consent_at: new Date().toISOString() }).eq("user_id", userId).is("recording_consent_at", null).throwOnError();
  } else {
    const { data: me } = await supabase.from("profiles").select("recording_consent_at").eq("user_id", userId).maybeSingle().throwOnError();
    if (!me?.recording_consent_at) return { code: 409, body: { error: "consent" } };
  }
  // The highest number, not the count, so a deleted lecture never makes two "Lecture 3"s.
  // shortcut: two creates in the same instant can share a number; add a unique index if that is ever seen.
  const { data: last } = await supabase.from("lectures").select("number").eq("lecture_course_id", lectureCourseId).eq("user_id", userId).order("number", { ascending: false }).limit(1).maybeSingle().throwOnError();
  const number = (last?.number ?? 0) + 1;
  const { data } = await admin.from("lectures").insert({ user_id: userId, lecture_course_id: lectureCourseId, number, source }).select("id").single().throwOnError();
  return { code: 201, body: { id: data.id, number } };
}

/** Transcribes and reads one uploaded segment, and saves the result with frame urls as paths (signed urls expire). */
async function runSegment(supabase: Db, admin: Db, userId: string, lectureId: string, n: number, frames: { t: number; changed: boolean }[], keywords: string[]) {
  const dir = `${userId}/${lectureId}`;
  const { data: wav, error } = await supabase.storage.from("lectures").download(`${dir}/${n}.wav`);
  if (!wav) throw error ?? new Error(`segment ${n}: no audio`);
  const names = frames.map((f) => `${n}-${f.t}.jpg`);
  const signed = names.length ? (await supabase.storage.from("lectures").createSignedUrls(names.map((p) => `${dir}/${p}`), 600)).data ?? [] : [];
  const urls = frames.flatMap((f, i) => (signed[i]?.signedUrl ? [{ ...f, url: signed[i].signedUrl }] : []));
  const out = await processSegment({ wav, offset: n * SEG, frames: urls, keywords });
  const path = <T extends { t: number }>(x: T) => ({ ...x, url: `${n}-${x.t}.jpg` });
  const result: Segment = { turns: out.turns, frames: out.frames.map(path), snaps: out.snaps.map(path) };
  await admin.from("lecture_segments").upsert({ lecture_id: lectureId, user_id: userId, n, status: "done", result: result as never }, { onConflict: "lecture_id,n" }).throwOnError();
  return result;
}

export async function saveSegment(supabase: Db, userId: string, id: string, nParam: string, input: unknown): Promise<Reply> {
  const lecture = await load(supabase, userId, id);
  if (!lecture) return NOT_FOUND;
  const n = Number(nParam);
  if (!/^\d{1,3}$/.test(nParam) || n >= MAX_SEGMENTS) return bad("Unknown segment.");
  const parsed = Frames.safeParse(input);
  if (!parsed.success) return bad("Send the segment's frames.");
  if (lecture.status !== "recording") return { code: 409, body: { error: "This lecture is no longer recording." } };
  const admin = createAdminClient();
  const { frames } = parsed.data;
  // Kept first so finish can process it again if this request dies.
  await admin.from("lecture_segments").upsert({ lecture_id: id, user_id: userId, n, status: "uploaded", result: { frames } }, { onConflict: "lecture_id,n" }).throwOnError();
  try {
    await runSegment(supabase, admin, userId, id, n, frames, (await courseOf(supabase, userId, lecture.lecture_course_id))?.keywords ?? []);
  } catch (err) {
    // Not fatal: finish processes every segment that is not done.
    console.error(`[lectures] segment ${n} of ${id} failed`, err);
    await admin.from("lecture_segments").update({ status: "failed" }).eq("lecture_id", id).eq("n", n).eq("user_id", userId);
  }
  return { code: 202, body: {} };
}

export async function finish(supabase: Db, userId: string, id: string, input: unknown): Promise<Reply> {
  const lecture = await load(supabase, userId, id);
  if (!lecture) return NOT_FOUND;
  const parsed = Finish.safeParse(input);
  if (!parsed.success) return bad("Send the segment count.");
  const admin = createAdminClient();
  // Only the request whose update matched goes on: a second finish (or a double tap on Retry) composes nothing. A finish
  // killed mid-way (300 s, a deploy) leaves `processing`; after STALE_MS Retry takes it over.
  const flip = () =>
    admin.from("lectures").update({ status: "processing", processing_at: new Date().toISOString(), segment_count: parsed.data.segmentCount, error: null }).eq("id", id).eq("user_id", userId);
  let { data: won } = await flip().in("status", ["recording", "failed"]).select("id").throwOnError();
  if (!won?.length) ({ data: won } = await flip().eq("status", "processing").lt("processing_at", new Date(Date.now() - STALE_MS).toISOString()).select("id").throwOnError());
  if (!won?.length) return { code: 200, body: { status: (await load(supabase, userId, id))?.status ?? lecture.status } };

  const dir = `${userId}/${id}`;
  let runId: string | null = null;
  try {
    // The course cascades its lectures away, so it is here while the lecture is.
    const course = await courseOf(supabase, userId, lecture.lecture_course_id);
    if (!course) throw new Error(`lecture ${id}: course not found`);
    const names = new Set(await listAll(supabase, dir));
    const { data: rows } = await supabase.from("lecture_segments").select("n, status, result").eq("lecture_id", id).eq("user_id", userId).throwOnError();
    // In parallel, so a finish with many missing segments stays well inside 300 s.
    const found = await Promise.all(
      Array.from({ length: parsed.data.segmentCount }, (_, n) => {
        const row = rows?.find((r) => r.n === n);
        if (row?.status === "done") return row.result as unknown as Segment;
        // No audio uploaded: a gap in the notes, not a failed lecture.
        if (!names.has(`${n}.wav`)) return null;
        const frames = (row?.result as { frames?: { t: number; changed: boolean }[] } | null)?.frames ?? [];
        return runSegment(supabase, admin, userId, id, n, frames, course.keywords);
      }),
    );
    const segments = found.filter((s) => s !== null);
    // Notes from no words and no boards would be the model's invention.
    if (!segments.some((s) => s.turns.length || s.snaps.length)) throw new Error("Nothing was recorded", { cause: "refused" });

    runId = await startRun(supabase, "lecture");
    // Front Row records outside Cadenza's weeks: no course material, the course's keywords for its terms.
    const { notes, snaps } = await finishLecture(segments, course.name, "", course.keywords);
    await admin.from("lectures").update({ status: "ready", title: notes.title.slice(0, 200), notes: notes as never, snaps: snaps as never, error: null }).eq("id", id).eq("user_id", userId).throwOnError();
    if (runId) await admin.from("runs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", runId).eq("user_id", userId);
    // The audio goes once the notes are saved; the frames stay for the snapshots.
    const wavs = [...names].filter((f) => f.endsWith(".wav")).map((f) => `${dir}/${f}`);
    if (wavs.length) {
      const { error } = await supabase.storage.from("lectures").remove(wavs);
      if (error) console.error(`[lectures] ${id}: audio not removed`, error);
    }
    return { code: 200, body: { status: "ready" } };
  } catch (err) {
    console.error(`[lectures] finish ${id} failed`, err);
    const error = err instanceof Error && err.cause === "refused" ? err.message : SOMETHING_WRONG;
    if (runId) await admin.from("runs").update({ status: "failed", error, finished_at: new Date().toISOString() }).eq("id", runId).eq("user_id", userId);
    // The audio is kept for Retry.
    const { error: stuck } = await admin.from("lectures").update({ status: "failed", error }).eq("id", id).eq("user_id", userId);
    if (stuck) console.error(`[lectures] ${id}: not marked failed, Retry takes it over after 6 minutes`, stuck);
    return { code: 200, body: { status: "failed", error } };
  }
}

export async function deleteLecture(supabase: Db, userId: string, id: string): Promise<Reply> {
  const lecture = await load(supabase, userId, id);
  if (!lecture) return NOT_FOUND;
  const dir = `${userId}/${id}`;
  const names = await listAll(supabase, dir);
  if (names.length) {
    const { error } = await supabase.storage.from("lectures").remove(names.map((n) => `${dir}/${n}`));
    if (error) throw error;
  }
  // The student's own client: files and lectures both let their owner delete.
  if (lecture.file_id) await supabase.from("files").delete().eq("id", lecture.file_id).eq("user_id", userId).eq("origin", "lecture").throwOnError();
  await supabase.from("lectures").delete().eq("id", id).eq("user_id", userId).throwOnError();
  return { code: 200, body: {} };
}

export async function renameLecture(supabase: Db, userId: string, id: string, input: unknown): Promise<Reply> {
  if (!(await load(supabase, userId, id))) return NOT_FOUND;
  const parsed = Rename.safeParse(input);
  if (!parsed.success) return bad("Send a title of 1 to 200 characters.");
  await createAdminClient().from("lectures").update({ title: parsed.data.title }).eq("id", id).eq("user_id", userId).throwOnError();
  return { code: 200, body: { title: parsed.data.title } };
}

/** The caller's ready lecture with its notes, or null. */
async function loadNotes(supabase: Db, userId: string, id: string) {
  const lecture = await load(supabase, userId, id);
  if (!lecture || lecture.status !== "ready") return lecture && { lecture, notes: null };
  const { data } = await supabase.from("lectures").select("notes, snaps, created_at").eq("id", id).eq("user_id", userId).single().throwOnError();
  return { lecture, notes: data.notes as unknown as Notes, snaps: (data.snaps ?? []) as unknown as Snapshot[], createdAt: data.created_at };
}

/** Add to Cadenza: the notes become a `lecture` file in a week the student can see (their own, or a class week). */
export async function linkLecture(supabase: Db, userId: string, id: string, input: unknown): Promise<Reply> {
  const found = await loadNotes(supabase, userId, id);
  if (!found) return NOT_FOUND;
  const parsed = Link.safeParse(input);
  if (!parsed.success) return bad("Send a week.");
  if (!found.notes) return { code: 409, body: { error: "These notes are not ready yet." } };
  const { lecture } = found;
  if (lecture.file_id) return { code: 200, body: { fileId: lecture.file_id } };
  const week = (await supabase.from("weeks").select("id, course_id, number, topic").eq("id", parsed.data.weekId).maybeSingle().throwOnError()).data;
  if (!week) return { code: 404, body: { error: "Week not found." } };
  const admin = createAdminClient();
  const markdown = toMarkdown(found.notes, found.snaps);
  const name = `Lecture ${lecture.number}${lecture.title ? ` · ${lecture.title}` : ""}`.slice(0, 200);
  const { data: file } = await admin
    .from("files")
    .insert({ user_id: userId, course_id: week.course_id, week_id: week.id, name, origin: "lecture", text: markdown, status: "extracted", detected_type: "notes", size_bytes: Buffer.byteLength(markdown) })
    .select("id")
    .single()
    .throwOnError();
  // Only one Add to Cadenza lands: a second one racing this removes its own file and answers with the first.
  const { data: won } = await admin.from("lectures").update({ file_id: file.id, course_id: week.course_id, week_id: week.id }).eq("id", id).eq("user_id", userId).is("file_id", null).select("id").throwOnError();
  if (!won?.length) {
    await admin.from("files").delete().eq("id", file.id).eq("user_id", userId);
    return { code: 200, body: { fileId: (await load(supabase, userId, id))?.file_id ?? null } };
  }
  await indexFiles(admin, [{ id: file.id, user_id: userId, name, text: markdown, topic: week.topic ?? `Week ${week.number}` }]);
  return { code: 200, body: { fileId: file.id } };
}

/** The caller's ready notes as a Word file or a PDF, named "<course> <Mon D> notes.<ext>". */
export async function exportLecture(supabase: Db, userId: string, id: string, format: string | null): Promise<Reply | { bytes: Uint8Array; filename: string; type: string }> {
  const found = await loadNotes(supabase, userId, id);
  if (!found) return NOT_FOUND;
  if (format !== "pdf" && format !== "docx") return bad("Ask for pdf or docx.");
  if (!found.notes) return { code: 409, body: { error: "These notes are not ready yet." } };
  const course = await courseOf(supabase, userId, found.lecture.lecture_course_id);
  const markdown = toMarkdown(found.notes, found.snaps);
  const day = new Date(found.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Toronto" });
  const filename = `${course?.name ?? "Lecture"} ${day} notes`.replace(/[^\w .()-]+/g, "").trim() + `.${format}`;
  return format === "pdf"
    ? { bytes: await notesPdf(markdown), filename, type: "application/pdf" }
    : { bytes: notesDocx(markdown), filename, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
}
