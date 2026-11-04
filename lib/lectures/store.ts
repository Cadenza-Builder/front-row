import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { z } from "zod";
import { refused } from "@/lib/billing/plans";
import type { Snapshot } from "@/lib/lecture/board";
import { toMarkdown, type Notes } from "@/lib/lecture/compose";
import { locate, type Box } from "@/lib/lecture/locate";
import { finishLecture, processSegment } from "@/lib/lecture/pipeline";
import { SOMETHING_WRONG } from "@/lib/runs/startRun";
import { removeFolder } from "@/lib/account/deleteAccount";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { notesDocx, notesPdf } from "./export";

// Front Row's Cadenza glue (docs/superpowers/plans/2026-10-27-lecture-notes.md, Task 7). The browser can only read its
// lectures, so every lecture and segment write (and delete) is the admin client's, with the caller's user_id set and
// filtered, after an RLS read of the lecture, its Front Row course, or (Add to Cadenza) the week. Storage paths are
// always built here: `${userId}/${lectureId}/…`.

type Db = SupabaseClient<Database>;
type Reply = { code: number; body: Record<string, unknown> };
type Segment = Awaited<ReturnType<typeof processSegment>>;
type Lecture = { id: string; lecture_course_id: string; number: number; title: string | null; status: string; file_id: string | null; started_at: string };

const SEG = 120; // seconds per segment, as the recorder cuts them
const MAX_SEGMENTS = 180; // six hours
const STALE_MS = 6 * 60_000; // past maxDuration: a finish still processing after this was killed
const NOT_FOUND: Reply = { code: 404, body: { error: "Lecture not found." } };
const bad = (error: string): Reply => ({ code: 400, body: { error } });
/** The last segment a lecture can have reached by now, a minute of clock slack included: segment work keeps pace with real time. The ceiling is still the daily run cap. */
const lastSegment = (l: Lecture) => Math.floor(((Date.now() - Date.parse(l.started_at)) / 1000 + 60) / SEG);

const Create = z.strictObject({ lectureCourseId: z.uuid(), source: z.enum(["phone", "room"]), consent: z.literal(true).optional() });
const Rename = z.strictObject({ title: z.string().trim().min(1).max(200) });
const Link = z.strictObject({ weekId: z.uuid() });
const Frames = z.strictObject({ frames: z.array(z.strictObject({ t: z.number().min(0).max(MAX_SEGMENTS * SEG), changed: z.boolean() })).max(60), last: z.boolean().optional() });
// A phone frame for the live board outline: a JPEG data URL only (never a URL SAM would fetch), ~640 px wide.
const Frame = z.strictObject({ frame: z.string().max(400_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/) });
const Finish = z.strictObject({ segmentCount: z.number().int().min(1).max(MAX_SEGMENTS) });

/** The caller's lecture under RLS, or null (unknown, foreign or not a uuid). */
async function load(supabase: Db, userId: string, id: string): Promise<Lecture | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data } = await supabase.from("lectures").select("id, lecture_course_id, number, title, status, file_id, started_at").eq("id", id).eq("user_id", userId).maybeSingle().throwOnError();
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
  // The lecture's segment work (transcribe, SAM, board reads) counts here, one run per lecture: it is done, not running,
  // since segments arrive for hours. finish counts its own run.
  let runId: string;
  try {
    runId = await startRun(supabase, "lecture");
  } catch (err) {
    if (err instanceof Error && err.cause === "refused") return { code: 429, body: { error: err.message } };
    throw err;
  }
  await admin.from("runs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", runId).eq("user_id", userId);
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

/** The board in a frame from a lecture that is recording, as fractions of the frame, for the phone's live outline. */
export async function findBoard(supabase: Db, userId: string, id: string, input: unknown): Promise<Reply> {
  const lecture = await load(supabase, userId, id);
  if (!lecture) return NOT_FOUND;
  const parsed = Frame.safeParse(input);
  if (!parsed.success) return bad("Send one JPEG frame.");
  // Past the six-hour ceiling a lecture left recording is not a lecture anymore, so it stops buying SAM calls.
  // shortcut: no per-lecture count of asks; add one (a column, as lastSegment bounds segments) before Front Row is public.
  if (lecture.status !== "recording" || lastSegment(lecture) >= MAX_SEGMENTS) return { code: 409, body: { error: "This lecture is no longer recording." } };
  const { board, person } = await locate(parsed.data.frame);
  const frac = (b: Box | null) => b && { x: b.x1 / b.w, y: b.y1 / b.h, w: (b.x2 - b.x1) / b.w, h: (b.y2 - b.y1) / b.h };
  return { code: 200, body: { board: frac(board), person: frac(person) } };
}

export async function saveSegment(supabase: Db, userId: string, id: string, nParam: string, input: unknown): Promise<Reply> {
  const lecture = await load(supabase, userId, id);
  if (!lecture) return NOT_FOUND;
  const n = Number(nParam);
  if (!/^\d{1,3}$/.test(nParam) || n >= MAX_SEGMENTS || n > lastSegment(lecture)) return bad("Unknown segment.");
  const parsed = Frames.safeParse(input);
  if (!parsed.success) return bad("Send the segment's frames.");
  if (lecture.status !== "recording") return { code: 409, body: { error: "This lecture is no longer recording." } };
  const admin = createAdminClient();
  const { frames, last } = parsed.data;
  // Kept first so finish can process it again if this request dies. Each segment is processed here once: a second send
  // (a retry, a replay) hits the (lecture_id, n) key and is left to finish, which does the ones not done. The segment cut
  // at Stop is marked `last`: finish, called straight after, processes it rather than waiting for this request.
  const { error } = await admin.from("lecture_segments").insert({ lecture_id: id, user_id: userId, n, status: "uploaded", result: { frames, last } });
  if (error?.code === "23505") return { code: 202, body: {} };
  if (error) throw error;
  if (last) return { code: 202, body: {} };
  // After the reply, so the phone's next send (and finish at Stop) never waits on this one's minute of work.
  after(async () => {
    try {
      await runSegment(supabase, admin, userId, id, n, frames, (await courseOf(supabase, userId, lecture.lecture_course_id))?.keywords ?? []);
    } catch (err) {
      // Not fatal: finish processes every segment that is not done.
      console.error(`[lectures] segment ${n} of ${id} failed`, err);
      // Only while still uploaded: finish may have taken it over and saved it done.
      await admin.from("lecture_segments").update({ status: "failed" }).eq("lecture_id", id).eq("n", n).eq("user_id", userId).eq("status", "uploaded");
    }
  });
  return { code: 202, body: {} };
}

export async function finish(supabase: Db, userId: string, id: string, input: unknown): Promise<Reply> {
  // The route's maxDuration is 300 s from the request; 20 s are left for saving the notes and the run row.
  // shortcut: the last segment (sent with `last`) and any taken over are processed in here and share this budget; a very
  // slow one can leave too little for the notes and the lecture fails, which Retry recovers. Split if it shows up.
  const deadline = Date.now() + 280_000;
  // A segment still processing in its own request is waited for until then, then done here. Segment work measured
  // 47-60 s healthy and ~115 s on a slow Meta night; 90 s, a redo and the notes still fit the deadline.
  const takeOver = Date.now() + 90_000;
  const lecture = await load(supabase, userId, id);
  if (!lecture) return NOT_FOUND;
  const parsed = Finish.safeParse(input);
  if (!parsed.success) return bad("Send the segment count.");
  const admin = createAdminClient();
  // Only the request whose update matched goes on: a second finish (or a double tap on Retry) composes nothing. A finish
  // killed mid-way (300 s, a deploy) leaves `processing`; after STALE_MS Retry takes it over.
  const flip = () =>
    // notes: null so a Retry never shows the failed run's draft again.
    admin.from("lectures").update({ status: "processing", processing_at: new Date().toISOString(), segment_count: parsed.data.segmentCount, error: null, notes: null }).eq("id", id).eq("user_id", userId);
  let { data: won } = await flip().in("status", ["recording", "failed"]).select("id").throwOnError();
  if (!won?.length) ({ data: won } = await flip().eq("status", "processing").lt("processing_at", new Date(Date.now() - STALE_MS).toISOString()).select("id").throwOnError());
  if (!won?.length) return { code: 200, body: { status: (await load(supabase, userId, id))?.status ?? lecture.status } };

  const dir = `${userId}/${id}`;
  let runId: string | null = null;
  try {
    // Before any segment work: a Retry after a failure processes segments again, so each one counts.
    runId = await startRun(supabase, "lecture");
    // The course cascades its lectures away, so it is here while the lecture is.
    const course = await courseOf(supabase, userId, lecture.lecture_course_id);
    if (!course) throw new Error(`lecture ${id}: course not found`);
    const names = new Set(await listAll(supabase, dir));
    const { data: rows } = await supabase.from("lecture_segments").select("n, status, result").eq("lecture_id", id).eq("user_id", userId).throwOnError();
    // In parallel, so a finish with many missing segments stays well inside 300 s.
    const found = await Promise.all(
      Array.from({ length: Math.min(parsed.data.segmentCount, lastSegment(lecture) + 1) }, async (_, n) => {
        let row = rows?.find((r) => r.n === n);
        // No audio uploaded: a gap in the notes, not a failed lecture.
        if (row?.status !== "done" && !names.has(`${n}.wav`)) return null;
        const uploaded = row?.result as { frames?: { t: number; changed: boolean }[]; last?: boolean } | null;
        while (row?.status === "uploaded" && !uploaded?.last && Date.now() < takeOver) {
          await new Promise((r) => setTimeout(r, 2000));
          row = (await supabase.from("lecture_segments").select("n, status, result").eq("lecture_id", id).eq("n", n).eq("user_id", userId).maybeSingle().throwOnError()).data ?? undefined;
        }
        if (row?.status === "done") return row.result as unknown as Segment;
        return runSegment(supabase, admin, userId, id, n, uploaded?.frames ?? [], course.keywords);
      }),
    );
    const segments = found.filter((s) => s !== null);
    // Notes from no words and no boards would be the model's invention.
    if (!segments.some((s) => s.turns.length || s.snaps.length)) throw new Error("Nothing was recorded", { cause: "refused" });

    // Front Row records outside Cadenza's weeks: the course's keywords for its terms.
    // The draft shows on the Wait screen and opens with its photos; only while processing, so a late one never
    // overwrites ready or failed notes.
    const onDraft = async (draft: Notes, draftSnaps: Snapshot[]) => {
      await admin.from("lectures").update({ notes: draft as never, snaps: draftSnaps as never }).eq("id", id).eq("user_id", userId).eq("status", "processing").throwOnError();
    };
    const { notes, snaps, usage } = await finishLecture(segments, course.name, course.keywords, onDraft, deadline);
    await admin.from("lectures").update({ status: "ready", title: notes.title.slice(0, 200), notes: notes as never, snaps: snaps as never, error: null }).eq("id", id).eq("user_id", userId).throwOnError();
    await admin.from("runs").update({ status: "done", usage, tokens: Object.values(usage).reduce((n, m) => n + m.in + m.out, 0), finished_at: new Date().toISOString() }).eq("id", runId).eq("user_id", userId);
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
  // The browser cannot delete a lecture, so its files never outlive it: they go first, then the row, as the server.
  const admin = createAdminClient();
  await removeFolder(admin, `${userId}/${id}`, "lectures"); // paged: storage removes at most 1000 per call
  // The Add to Cadenza copy is a file in the student's week: it stays, as the delete sheet says.
  await admin.from("lectures").delete().eq("id", id).eq("user_id", userId).throwOnError();
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
  const markdown = toMarkdown(found.notes);
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
  // Not indexed here (Front Row calls Meta models only): Cadenza indexes unindexed files on the student's first chat question.
  return { code: 200, body: { fileId: file.id } };
}

/** The caller's ready notes as a Word file or a PDF, named "<course> <Mon D> notes.<ext>". */
export async function exportLecture(supabase: Db, userId: string, id: string, format: string | null): Promise<Reply | { bytes: Uint8Array; filename: string; type: string }> {
  const found = await loadNotes(supabase, userId, id);
  if (!found) return NOT_FOUND;
  if (format !== "pdf" && format !== "docx") return bad("Ask for pdf or docx.");
  if (!found.notes) return { code: 409, body: { error: "These notes are not ready yet." } };
  const course = await courseOf(supabase, userId, found.lecture.lecture_course_id);
  const markdown = toMarkdown(found.notes);
  const day = new Date(found.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Toronto" });
  const filename = `${course?.name ?? "Lecture"} ${day} notes`.replace(/[^\w .()-]+/g, "").trim() + `.${format}`;
  return format === "pdf"
    ? { bytes: await notesPdf(markdown), filename, type: "application/pdf" }
    : { bytes: notesDocx(markdown), filename, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
}
