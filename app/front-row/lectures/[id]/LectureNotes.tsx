"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MathText, TeX } from "@/components/MathText";
import type { NoteBox, Notes } from "@/lib/lecture/compose";
import type { Box } from "@/lib/lecture/locate";
import { createClient } from "@/lib/supabase/browser";
import { Progress, fitPairs, useReading } from "@/app/courses/[id]/weeks/[n]/learn/Connected";
import { Scatter } from "@/app/courses/[id]/weeks/[n]/learn/GraphBlock";

/** A board snapshot with a url the browser can show (signed, or the sample's). */
export type Shot = { t: number; src: string; board: Box; alt: string };
export type Said = { start: number; text: string };
export type Lecture = {
  /** Null: the public sample, nothing saved. */
  id: string | null;
  course: string;
  number: number | null;
  /** "ECO220 · Lecture 9 · Tue Oct 27 · 52 min" */
  label: string;
  /** "Tue Oct 27" */
  date: string;
  seconds: number;
  notes: Notes;
  shots: Shot[];
  turns: Said[];
  /** The Cadenza week it was added to. */
  linked: { label: string; href: string } | null;
};

export const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const paras = (text: string) => text.split(/\n{2,}/).map((p, i) => <p key={i}><MathText text={p} /></p>);
const MORE = <svg className="ic" viewBox="0 0 24 24"><path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3.2" /></svg>;
const BIN = <svg className="ic" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
const GONE = <svg className="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>;
const PHOTO = <svg className="ic" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M21 16l-5-5-8 8" /></svg>;

/** The board region SAM found, cut from its frame (the viewBox is the box, the image the whole frame); no box: the frame. */
export function Crop({ shot }: { shot: { src: string; alt: string; board: Box | null } }) {
  const b = shot.board;
  return (
    <div className="crop">
      {b ? <svg viewBox={`${b.x1} ${b.y1} ${b.x2 - b.x1} ${b.y2 - b.y1}`} role="img" aria-label={shot.alt}><image href={shot.src} width={b.w} height={b.h} /></svg>
      // eslint-disable-next-line @next/next/no-img-element -- a signed storage url, not an optimisable asset
      : <img src={shot.src} alt={shot.alt} />}
    </div>
  );
}

function BoxView({ b }: { b: NoteBox }) {
  switch (b.kind) {
    case "formula":
      return (
        <figure className="box fbox">
          <p className="label">Formula</p>
          <div className="fx"><TeX latex={b.tex} /></div>
          {b.symbols.length > 0 && (
            <dl className="sym">{b.symbols.map((s, i) => <Fragment key={i}><dt><TeX latex={s.sym} block={false} /></dt><dd><MathText text={s.meaning} /></dd></Fragment>)}</dl>
          )}
        </figure>
      );
    case "example":
      return (
        <div className="box wex">
          <p className="label">Worked Example</p>
          <p className="q"><MathText text={b.question} /></p>
          <ol className="steps">
            {b.steps.map((s, i) => {
              // A step that ends on display maths shows it under its sentence, as the lesson's steps do.
              const m = s.match(/^([\s\S]*?)\$\$([\s\S]+?)\$\$\s*$/);
              return <li key={i}><p><MathText text={m ? m[1].trim() : s} /></p>{m && <div className="ml"><TeX latex={m[2]} /></div>}</li>;
            })}
          </ol>
          <p className="ans"><span className="label">Answer</span><span><MathText text={b.answer} /></span></p>
          {b.check && <p className="vfy"><MathText text={b.check} /></p>}
        </div>
      );
    case "graph":
      return (
        <figure className="box graph">
          <p className="label">Graph</p>
          <p className="graph__t"><MathText text={b.title} /></p>
          <Scatter {...b} w={320} h={220} cls="g-n" />
          <Scatter {...b} w={720} h={240} cls="g-w" />
          {b.caption && <figcaption className="hint"><MathText text={b.caption} /></figcaption>}
        </figure>
      );
    case "mistake":
      return <aside className="box trap"><p className="label">Common Mistake</p><p><MathText text={b.text} /></p></aside>;
  }
}

/** Pairs of side-by-side blocks; a lone one goes full width. */
const twos = (xs: React.ReactNode[]) =>
  Array.from({ length: Math.ceil(xs.length / 2) }, (_, i) => (xs.length - i * 2 > 1 ? <div key={`t${i}`} className="pair">{xs[i * 2]}{xs[i * 2 + 1]}</div> : xs[i * 2]));

/**
 * The Read screen (mockups/front-row/read.html): the lecture's notes as a Cadenza lesson. Each part has its time and a
 * Source button per board photo (the photo opens in a dialog, never inline), its boxes, and the exam flags; then
 * Putting It Together and the ways to save.
 */
export function LectureNotes({ lecture: L, tab }: { lecture: Lecture; tab: "notes" | "transcript" }) {
  const router = useRouter();
  const { notes, shots } = L;
  const n = notes.sections.length;
  // read: true keeps useReading from writing a lesson's read mark: Front Row only shows how far the student is.
  const { prog, finished, setPart } = useReading(n, "front-row", true, true);
  const root = useRef<HTMLElement>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const save = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [view, setView] = useState<number | "add" | null>(null);
  const lect = useRef<HTMLDialogElement>(null);
  const del = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useLayoutEffect(() => {
    const fit = () => fitPairs(root.current);
    fit();
    void document.fonts?.ready.then(fit);
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, [notes, tab]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => (e.type === "click" ? !save.current?.contains(e.target as Node) : (e as KeyboardEvent).key === "Escape") && setMenu(false);
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
  useEffect(() => {
    if (view !== null && !dlg.current?.open) dlg.current?.showModal();
  }, [view]);

  const open = (v: number | "add") => {
    setMenu(false);
    setView(v);
  };
  // The sample's ways out all lead to Front Row's front door.
  const exp = (format: "pdf" | "docx") => (L.id ? `/api/lectures/${L.id}/export?format=${format}` : "/front-row");
  const add = (cls: string, body: React.ReactNode) =>
    L.linked ? <Link className={cls} href={L.linked.href}>{body}</Link>
    : L.id ? <button type="button" className={cls} onClick={() => open("add")}>{body}</button>
    : <Link className={cls} href="/front-row">{body}</Link>;
  // A part runs from its first board photo or exam flag to the next part's.
  const starts = notes.sections.map((s) => {
    const ts = [...s.snaps.map((i) => shots[i]?.t), ...s.exam.map((e) => e.t)].filter((t) => t !== undefined);
    return ts.length ? Math.min(...ts) : null;
  });
  const near = (t: number) => Math.max(0, shots.findLastIndex((s) => s.t <= t));
  const tabs = (
    <nav className="tabs" aria-label={L.number ? `Lecture ${L.number}` : "Lecture"}>
      <Link className={tab === "notes" ? "on" : undefined} aria-current={tab === "notes" ? "page" : undefined} href="?">Notes</Link>
      <Link className={tab === "transcript" ? "on" : undefined} aria-current={tab === "transcript" ? "page" : undefined} href="?tab=transcript">Transcript</Link>
    </nav>
  );
  const files = [
    shots.length > 0 && <span key="b" className="file"><svg className="ic"><use href="#i-file" /></svg><b>{`${shots.length} board photo${shots.length === 1 ? "" : "s"}`}</b><span>{`${clock(shots[0].t)} to ${clock(shots.at(-1)!.t)}`}</span></span>,
    <span key="t" className="file"><svg className="ic"><use href="#i-file" /></svg><b>Transcript</b><span>{`${Math.round(L.seconds / 60)} min`}</span></span>,
  ].filter(Boolean);
  const title = /[.!?]$/.test(notes.title) ? notes.title : `${notes.title}.`;
  const name = L.number ? `Lecture ${L.number}` : "Lecture";
  const min = `${Math.round(L.seconds / 60)} min`;
  const parts = `${n} part${n === 1 ? "" : "s"}`;
  // The audio is not listed: finish removes it once the notes are saved.
  const photos = shots.length > 0 && `${shots.length} board photo${shots.length === 1 ? "" : "s"}`;
  const shut = () => (lect.current?.close(), del.current?.close(), setErr(null));
  // Rename and delete; the sample's ways out lead to Front Row's front door instead.
  const call = async (init: RequestInit, then: () => void) => {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/lectures/${L.id}`, init).catch(() => null);
    setBusy(false);
    if (res?.ok) then();
    else setErr(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "That did not work. Try again.");
  };
  const rename = () => call({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: field.current!.value.trim() }) }, () => (shut(), router.refresh()));
  const drop = () => call({ method: "DELETE" }, () => router.push("/front-row/home"));

  return (
    <div className="s-learn fr-read">
      <div className="top">
        <Link className="back" href={L.id ? "/front-row/home" : "/front-row"}>
          <span className="tile"><svg className="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg></span>
          <span><b>{L.course}</b> · Lectures</span>
        </Link>
        <div className={menu ? "save open" : "save"} ref={save}>
          <button type="button" className="cz-btn" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <span className="cz-btn__label">Save Notes</span>
            <span className="cz-btn__arrow" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v8M4.5 7.5 8 11l3.5-3.5M3 13h10" /></svg></span>
          </button>
          <div className="save__menu glass">
            {add("", <><svg className="ic" viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 19V5" /></svg>{L.linked ? "In Cadenza" : "Add to Cadenza"}<span>{`${L.linked?.label ?? "Pick a week"} · your lesson and practice use them`}</span></>)}
            <a href={exp("pdf")}><svg className="ic" viewBox="0 0 24 24"><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></svg>Download PDF<span>Board text and maths included</span></a>
            <a href={exp("docx")}><svg className="ic" viewBox="0 0 24 24"><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 12l1 5 2-4 2 4 1-5" /></svg>Download Word<span>Opens in Google Docs too</span></a>
          </div>
        </div>
      </div>

      <main className="page" ref={root}>
        <div className="tc-head">
          <p className="label">{L.label}</p>
          <div className="ttl">
            <h1>{L.number && <><span className="light">{`Lecture ${L.number}`}</span> </>}<span className="cz-grad">{title}</span></h1>
            <button type="button" className="more" aria-label={`${name}: rename or delete`} onClick={() => (setErr(null), lect.current?.showModal(), field.current?.focus())}>{MORE}</button>
          </div>
          <p className="lead tc-one"><MathText text={notes.summary} /></p>
        </div>

        {tab === "transcript" ? (
          <>
            <div className="cbar2">{tabs}</div>
            <section className="part said">
              {L.turns.length ? <ol>{L.turns.map((t, i) => <li key={i}><time>{clock(t.start)}</time><span>{t.text}</span></li>)}</ol> : <p className="hint">No speech was captured.</p>}
            </section>
          </>
        ) : (
          <>
            <Progress tabs={tabs} files={files} titles={notes.sections.map((s) => s.heading)} done={finished} fill={prog.reduce((a, p) => a + p, 0) / n} ok={(k) => prog[k] === 1} heading="In These Notes" />
            <div className="stack lesson">
              {notes.sections.map((s, k) => {
                const boxes = s.boxes ?? [];
                const side = boxes[0] && boxes[0].kind !== "example";
                const rest = boxes.slice(side ? 1 : 0);
                const prose = <div className="prose">{paras(s.body)}</div>;
                const start = starts[k];
                return (
                  <section key={k} className={prog[k] === 1 ? "part ok" : "part"} id={`p${k}`} aria-labelledby={`h${k}`} ref={(el) => setPart(k, el)}>
                    <div className="part__head">
                      <span className="part__n"><b>{k + 1}</b><svg className="ic"><use href="#i-check" /></svg></span>
                      <div>
                        <h2 id={`h${k}`}><MathText text={s.heading} /></h2>
                        {(start !== null || s.snaps.length > 0) && (
                          <p className="part__src">
                            {start !== null && <><b>{`${clock(start)} to ${clock(starts.slice(k + 1).find((t) => t !== null) ?? L.seconds)}`}</b>{s.snaps.length > 0 && " · "}</>}
                            {s.snaps.map((i) => <button key={i} type="button" className="src" onClick={() => open(i)}>{PHOTO}{`Board · ${clock(shots[i].t)}`}</button>)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="part__body">
                      {side ? <div className="pair">{prose}<BoxView b={boxes[0]} /></div> : prose}
                      {rest.filter((b) => b.kind !== "mistake").map((b, i) => <BoxView key={i} b={b} />)}
                      {twos([
                        ...rest.filter((b) => b.kind === "mistake").map((b, i) => <BoxView key={`m${i}`} b={b} />),
                        ...s.exam.map((e, i) => (
                          <aside key={`e${i}`} className="exam">
                            <p className="label">Likely on the Exam</p>
                            <q><MathText text={e.quote} /></q>
                            {shots.length ? <button type="button" onClick={() => open(near(e.t))}>{`Said at ${clock(e.t)}.`}</button> : <span>{`Said at ${clock(e.t)}.`}</span>}
                          </aside>
                        )),
                      ])}
                    </div>
                  </section>
                );
              })}
              <section className="part">
                <div className="part__head"><span className="part__n"><b>✓</b></span><div><h2>Putting It Together</h2></div></div>
                {notes.together && <p className="hook hook--sum"><MathText text={notes.together} /></p>}
                <div className="keep">
                  <p className="hint">Keep these notes with your course.</p>
                  <a className="cz-btn cz-btn--ghost" href={exp("pdf")}>Download PDF</a>
                  {add("cz-btn cz-btn--shimmer", <><span className="cz-btn__label">{L.linked ? "Open in Cadenza" : "Add to Cadenza"}</span><span className="cz-btn__arrow" aria-hidden="true">→</span></>)}
                </div>
              </section>
            </div>
          </>
        )}
      </main>

      <dialog id="source" className="glass" ref={dlg} onClose={() => setView(null)} onClick={(e) => e.target === dlg.current && dlg.current.close()}>
        {typeof view === "number" && shots[view] && (
          <>
            <Crop shot={shots[view]} />
            <div className="cap">
              <p><b>{`Board at ${clock(shots[view].t)}`}</b><span>Photo from your phone. Front Row read it into these notes.</span></p>
              <button type="button" className="cz-btn cz-btn--ghost" autoFocus onClick={() => dlg.current?.close()}>Close</button>
            </div>
          </>
        )}
        {view === "add" && L.id && <AddToCadenza id={L.id} close={() => dlg.current?.close()} done={() => { dlg.current?.close(); router.refresh(); }} />}
      </dialog>

      <dialog id="lect" className="glass" aria-labelledby="lect-h" ref={lect} onCancel={(e) => (e.preventDefault(), !busy && shut())}>
        <p className="when">{[L.course, L.number && name, L.date].filter(Boolean).join(" · ")}</p>
        <h2 id="lect-h"><span className="light">This</span> Lecture</h2>
        <label className="fld"><span>Title</span><input className="cz-field" ref={field} defaultValue={notes.title} maxLength={200} /></label>
        <p className="hint">{`Front Row named it from what was taught. ${L.number ? `${name} and the date stay.` : "The date stays."}`}</p>
        <ul className="held" aria-label="Saved with this lecture">
          <li>Notes<b>{parts}</b></li><li>Transcript<b>{min}</b></li>{photos && <li>Board photos<b>{shots.length}</b></li>}
        </ul>
        {err && <p className="hint err" role="alert">{err}</p>}
        <div className="acts">
          <button type="button" className="cz-btn cz-btn--danger" disabled={busy} onClick={() => (setErr(null), del.current?.showModal())}>{BIN}Delete Lecture</button>
          {L.id ? <button type="button" className="cz-btn" disabled={busy} onClick={rename}>Save Title</button> : <Link className="cz-btn" href="/front-row">Save Title</Link>}
        </div>
      </dialog>
      <dialog className="ask lv" id="del" aria-labelledby="del-h" ref={del} onCancel={(e) => (e.preventDefault(), !busy && shut())}>
        <h2 id="del-h"><span className="light">Delete</span> {`${name}?`}</h2>
        <p><b>{notes.title}</b>{`, from ${L.date}. This deletes it for good:`}</p>
        <ul>
          <li className="gone">{GONE}{`The notes, ${n === 1 ? parts : `all ${parts}`}`}</li>
          <li className="gone">{GONE}{`The transcript, ${min}`}</li>
          {photos && <li className="gone">{GONE}{`The ${photos}`}</li>}
          {L.linked && <li className="kept"><svg className="ic"><use href="#i-check" /></svg>{`The copy in ${L.linked.label} stays.`}</li>}
        </ul>
        <p>You can&apos;t undo this.</p>
        {err && <p className="hint err" role="alert">{err}</p>}
        <div className="acts">
          <button type="button" className="cz-btn cz-btn--ghost" autoFocus disabled={busy} onClick={shut}>Keep Lecture</button>
          {L.id ? <button type="button" className="cz-btn cz-btn--danger" disabled={busy} onClick={drop}>Delete for Good</button> : <Link className="cz-btn cz-btn--danger" href="/front-row">Delete for Good</Link>}
        </div>
      </dialog>
    </div>
  );
}

type Week = { id: string; course_id: string; number: number; topic: string | null };

/** Pick one of the student's Cadenza weeks; the link route writes the notes there as a week file. */
function AddToCadenza({ id, close, done }: { id: string; close: () => void; done: () => void }) {
  const [courses, setCourses] = useState<{ id: string; code: string | null; name: string }[] | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const db = createClient();
    void Promise.all([db.from("courses").select("id, code, name").order("created_at"), db.from("weeks").select("id, course_id, number, topic").order("number")]).then(([c, w]) => {
      setCourses(c.data ?? []);
      setWeeks(w.data ?? []);
    });
  }, []);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/lectures/${id}/link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekId: new FormData(e.currentTarget).get("week") }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) done();
    else setErr(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not add the notes. Try again.");
  };
  const any = courses?.some((c) => weeks.some((w) => w.course_id === c.id));
  return (
    <form className="addto" onSubmit={submit}>
      <p><b>Add to Cadenza</b><span>Pick the week. Your lesson and practice use these notes.</span></p>
      {courses === null ? <p className="hint">Loading your courses…</p> : !any ? <p className="hint">No Cadenza course yet. Make one, then add these notes to a week.</p> : (
        <select name="week" required aria-label="Week" defaultValue="">
          <option value="" disabled>Pick a week</option>
          {courses.map((c) => (
            <optgroup key={c.id} label={c.code || c.name}>
              {weeks.filter((w) => w.course_id === c.id).map((w) => <option key={w.id} value={w.id}>{`Week ${w.number}${w.topic ? ` · ${w.topic}` : ""}`}</option>)}
            </optgroup>
          ))}
        </select>
      )}
      {err && <p className="hint" role="alert">{err}</p>}
      <div className="cap">
        <button type="button" className="cz-btn cz-btn--ghost" onClick={close}>Cancel</button>
        {any && <button type="submit" className="cz-btn" disabled={busy}><span className="cz-btn__label">{busy ? "Adding…" : "Add"}</span></button>}
      </div>
    </form>
  );
}
