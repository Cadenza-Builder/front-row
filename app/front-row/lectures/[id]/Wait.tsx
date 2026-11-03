"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MathText } from "@/components/MathText";
import { createClient } from "@/lib/supabase/browser";
import type { Notes } from "@/lib/lecture/compose";
import { Crop, clock } from "./LectureNotes";
import { progress, type SegRow } from "./progress";

export type WaitLecture = { status: "recording" | "processing" | "ready" | "failed"; segment_count: number; duration_s: number | null; notes: unknown; error: string | null };

const POLL = 2000;
// The columns fill over the first 6 s, then show what each poll brings: real work, only paced on arrival.
const TICKS = 24;

/**
 * The Wait screen (mockups/front-row/wait.html, take Live Pipeline): the four steps and the three columns, from the
 * lecture row and its segments polled every 2 s (the browser reads its own under RLS). When the lecture is ready the
 * notes write in (a processing lecture's draft too), and Open Notes goes to Read (the same route, rendered again).
 */
export function Wait({ id, dir, initial, segments, srcs: signed }: { id: string; dir: string; initial: WaitLecture; segments: SegRow[]; srcs: Record<string, string> }) {
  const router = useRouter();
  const [lec, setLec] = useState(initial);
  const [rows, setRows] = useState(segments);
  const [srcs, setSrcs] = useState(signed);
  const [tick, setTick] = useState(0);
  const [wrote, setWrote] = useState(0);
  const p = progress(lec, rows);
  const live = lec.status === "recording" || lec.status === "processing";

  useEffect(() => {
    if (!live) return;
    const db = createClient();
    const t = setInterval(async () => {
      const known = rows.filter((r) => r.status === "done").map((r) => r.n);
      let q = db.from("lecture_segments").select("n, status, result").eq("lecture_id", id);
      // A heard segment never changes: only the rest are fetched again.
      if (known.length) q = q.not("n", "in", `(${known.join(",")})`);
      const [l, s] = await Promise.all([db.from("lectures").select("status, segment_count, duration_s, notes, error").eq("id", id).maybeSingle(), q]);
      if (s.data) setRows((old) => [...old.filter((r) => !s.data.some((x) => x.n === r.n)), ...s.data]);
      if (l.data) setLec(l.data);
    }, POLL);
    return () => clearInterval(t);
  }, [id, live, rows]);

  // Board photos the page has no url for yet.
  const unsigned = p.photos.map((x) => x.name).filter((n) => !srcs[n]).join("|");
  useEffect(() => {
    if (!unsigned) return;
    const names = unsigned.split("|");
    void createClient().storage.from("lectures").createSignedUrls(names.map((n) => `${dir}/${n}`), 3600).then(({ data }) =>
      setSrcs((m) => ({ ...m, ...Object.fromEntries(names.flatMap((n, i) => (data?.[i]?.signedUrl ? [[n, data[i].signedUrl]] : []))) })));
  }, [unsigned, dir]);

  useEffect(() => {
    if (tick >= TICKS) return;
    const t = setTimeout(() => setTick(tick + 1), 250);
    return () => clearTimeout(t);
  }, [tick]);
  const some = <T,>(xs: T[]) => xs.slice(0, Math.ceil((xs.length * tick) / TICKS));

  // The notes, as the doc writes them in: one element at a time once the columns have filled.
  // While processing, a draft (same shape) may already be saved; the final replaces it when the lecture is ready.
  const draft = lec.status === "processing" && !!(lec.notes as Notes | null)?.sections?.length;
  const notes = lec.status === "ready" || draft ? (lec.notes as Notes) : null;
  // "Topic: Point." puts the point in the gradient, as the mockup's heading.
  const title = notes && (/[.!?]$/.test(notes.title) ? notes.title : `${notes.title}.`);
  const cut = title ? title.indexOf(": ") + 1 : 0;
  const doc = !notes ? [] : [
    <h2 key="t">{title!.slice(0, cut)} <span className="cz-grad">{title!.slice(cut).trim()}</span></h2>,
    <p key="s" className="sum"><MathText text={notes.summary} /></p>,
    ...notes.sections.flatMap((s, k) => [
      <h3 key={`h${k}`}><MathText text={`${k + 1} · ${s.heading}`} /></h3>,
      ...s.body.split(/\n{2,}/).map((para, i) => <p key={`p${k}-${i}`}><MathText text={para} /></p>),
      ...s.exam.map((e, i) => <p key={`e${k}-${i}`} className="ex"><span>Likely on the exam</span><MathText text={e.quote} /></p>),
    ]),
    ...(notes.words.length ? [<h3 key="w">Terms</h3>, <ul key="wl">{notes.words.map((w, i) => <li key={i}><b>{`${w.term}:`}</b> <MathText text={w.meaning} /></li>)}</ul>] : []),
  ];
  const writing = !!notes && tick >= TICKS;
  useEffect(() => {
    if (!writing || wrote >= doc.length) return;
    const t = setTimeout(() => setWrote(wrote + 1), 280);
    return () => clearTimeout(t);
  }, [writing, wrote, doc.length]);
  // Written in: the final, or a draft that opens right away while clean-up runs (Read swaps the final in).
  const shown = writing && wrote >= doc.length && (lec.status === "ready" || draft);
  const ready = shown && lec.status === "ready";
  // Each column follows its newest line, as a live log does.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const el of box.current?.querySelectorAll(".maths, .tx, .doc") ?? []) el.scrollTop = el.scrollHeight;
  }, [wrote, tick, rows]);

  const retry = async () => {
    // A failed run's old draft is dropped: the new run writes its own.
    setLec({ ...lec, status: "processing", error: null, notes: null });
    setWrote(0);
    await fetch(`/api/lectures/${id}/finish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ segmentCount: Math.max(lec.segment_count, rows.length) }) }).catch(() => null);
  };

  const photos = some(p.photos);
  const readings = some(p.photos.filter((x) => x.snap));
  const last = readings.at(-1);
  const exams = notes?.sections.reduce((a, s) => a + s.exam.length, 0) ?? 0;
  const step = (k: number, label: string, small: string) => (
    <div className={p.steps[k] >= 1 ? "done" : p.steps[k] > 0 ? "on" : undefined}>
      <i><b style={{ "--f": p.steps[k] } as React.CSSProperties}></b></i>
      <span>{label} <small>{small}</small></span>
    </div>
  );

  return (
    <div className={writing ? "fr-wait writing" : "fr-wait"}>
      <div className="shell" ref={box}>
        <div className="bar1">
          <Link className="back" href="/front-row/home" aria-label="Home"><span className="tile"><svg className="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg></span></Link>
          {/* Still recording after the reveal: the phone's finish never landed (offline at Stop, or Back mid-lecture).
              With no part landed there is nothing to write notes from, so no button. */}
          {lec.status === "recording" && tick >= TICKS ? (
            <>
              <h1><span className="light">Notes</span> <span className="cz-grad">not started.</span></h1>
              <span className="err" role="alert">{rows.length ? "This lecture was never sent for notes." : "Nothing from this lecture reached Front Row."}</span>
              {rows.length > 0 && <button type="button" className="cz-btn" onClick={retry}><span className="cz-btn__label">Write Notes</span></button>}
            </>
          ) : lec.status === "failed" ? (
            <>
              <h1><span className="light">Notes</span> <span className="cz-grad">not written.</span></h1>
              <span className="err" role="alert">{lec.error}</span>
              <button type="button" className="cz-btn" onClick={retry}><span className="cz-btn__label">Retry</span></button>
            </>
          ) : shown ? (
            <>
              <h1>{ready ? <><span className="light">Your notes</span> <span className="cz-grad">are ready.</span></> : <><span className="light">Your draft</span> <span className="cz-grad">is ready.</span></>}</h1>
              <button type="button" className="cz-btn" onClick={() => router.refresh()}><span className="cz-btn__label">Open Notes</span><span className="cz-btn__arrow" aria-hidden="true">→</span></button>
            </>
          ) : (
            <h1><span className="light">Writing your</span> <span className="cz-grad">notes.</span></h1>
          )}
        </div>
        <div className="steps">
          {step(0, "Saving the last part", `${Math.round((lec.duration_s ?? lec.segment_count * 120) / 60)} min`)}
          {step(1, "Hearing the lecture", `${p.heard[0]} of ${p.heard[1]} parts`)}
          {step(2, "Reading the board", `${p.read} of ${p.photos.length} photos`)}
          {step(3, "Writing the notes", lec.status === "ready" && notes ? `${notes.sections.length} of ${notes.sections.length} parts` : p.steps[3] ? "Writing" : "Next")}
        </div>
        <div className="grid">
          <section className="col">
            <header><b>Board photos</b><span className="hud">{`${photos.length} kept`}</span></header>
            <div className="photos">
              {photos.map((x) => (
                <figure key={x.name} className={x.snap ? "ph read" : "ph reading"}>
                  {srcs[x.name] ? <Crop shot={{ src: srcs[x.name], alt: x.snap?.alt ?? `The board at ${clock(x.t)}`, board: x.snap?.board ?? null }} /> : <div className="crop" />}
                  <figcaption><span>{clock(x.t)}</span><b>{x.snap ? "Read" : ""}</b></figcaption>
                </figure>
              ))}
            </div>
          </section>
          <section className="col">
            <header><b>Reading the board</b><span className="hud">Muse Spark</span></header>
            <div className="read">
              <div className="big">
                {last && srcs[last.name] && <Crop shot={{ src: srcs[last.name], alt: last.snap!.alt, board: last.snap!.board }} />}
                <span className="tag">{last ? `Photo ${readings.length} · ${clock(last.t)}` : "Waiting for the first photo"}</span>
              </div>
              <div className="maths">
                {readings.map((x) => (
                  <div key={x.name} className={x.snap!.markdown.includes("$") ? "ln" : "ln txt"}>
                    <code>{x.snap!.markdown}</code>
                    <span className="out"><MathText text={x.snap!.markdown} /></span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="col">
            <header><b>Transcript</b><span className="hud">Muse Voice</span></header>
            <div className="tx">
              {some(p.turns).map((t, i) => <p key={i}><time>{clock(t.start)}</time><span><span className="who">Professor</span>{t.text}</span></p>)}
            </div>
          </section>
          <section className="notes" aria-live="polite">
            <header className="hud"><span>{ready ? `Your notes · ${exams} exam hint${exams === 1 ? "" : "s"}` : "Your notes · writing"}</span><span>Muse Spark</span></header>
            <div className="doc">{doc.slice(0, wrote)}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
