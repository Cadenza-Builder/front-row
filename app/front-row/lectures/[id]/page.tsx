import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { Snapshot } from "@/lib/lecture/board";
import { getUser } from "@/lib/supabase/server";
import type { Notes } from "@/lib/lecture/compose";
import { LectureNotes } from "./LectureNotes";
import { progress } from "./progress";
import { Wait } from "./Wait";
import "../../../courses/[id]/weeks/[n]/learn/screen-learn.css";
import "../../back.css";
import "./front-row.css";

export const metadata = { title: "Lecture Notes" };

/** One lecture: Wait while its notes are written, Read once they are. The browser reads only its own (RLS). */
export default async function LecturePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { supabase, userId } = await getUser();
  if (!userId) redirect("/sign-in?from=front-row");
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const [{ data: lec }, { data: segs }] = await Promise.all([
    supabase.from("lectures").select("*").eq("id", id).maybeSingle(),
    supabase.from("lecture_segments").select("n, status, result").eq("lecture_id", id),
  ]);
  if (!lec) notFound();
  const rows = segs ?? [];
  const dir = `${userId}/${id}`;
  const sign = async (names: string[]): Promise<Record<string, string>> => {
    if (!names.length) return {};
    const { data } = await supabase.storage.from("lectures").createSignedUrls(names.map((n) => `${dir}/${n}`), 3600);
    return Object.fromEntries(names.flatMap((n, i) => (data?.[i]?.signedUrl ? [[n, data[i].signedUrl]] : [])));
  };

  if (lec.status !== "ready") {
    const initial = { status: lec.status, segment_count: lec.segment_count, duration_s: lec.duration_s, notes: lec.notes, error: lec.error };
    return <Wait id={id} dir={dir} initial={initial} segments={rows} srcs={await sign(progress(lec, rows).photos.map((p) => p.name))} />;
  }

  const notes = lec.notes as unknown as Notes;
  const snaps = (lec.snaps ?? []) as unknown as Snapshot[];
  const srcs = await sign(snaps.map((s) => s.url));
  const name = (await supabase.from("lecture_courses").select("name").eq("id", lec.lecture_course_id).maybeSingle()).data?.name ?? "";
  const seconds = lec.duration_s ?? lec.segment_count * 120;
  const date = new Date(lec.started_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Toronto" }).replace(",", "");
  const week = lec.week_id ? (await supabase.from("weeks").select("number, course_id").eq("id", lec.week_id).maybeSingle()).data : null;
  const course = week ? (await supabase.from("courses").select("code, name").eq("id", week.course_id).maybeSingle()).data : null;
  return (
    <LectureNotes
      tab={tab === "transcript" ? "transcript" : "notes"}
      lecture={{
        id,
        course: name,
        number: lec.number,
        date,
        label: [name, `Lecture ${lec.number}`, date, `${Math.round(seconds / 60)} min`].filter(Boolean).join(" · "),
        seconds,
        // The student's rename wins over the title the notes gave themselves.
        notes: { ...notes, title: lec.title ?? notes.title },
        shots: snaps.map((s) => ({ t: s.t, src: srcs[s.url] ?? "", board: s.board, alt: s.alt })),
        turns: progress(lec, rows).turns,
        linked: week && course ? { label: `${course.code || course.name} · Week ${week.number}`, href: `/courses/${week.course_id}/weeks/${week.number}/learn` } : null,
      }}
    />
  );
}
