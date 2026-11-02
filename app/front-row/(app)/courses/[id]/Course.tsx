"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { getCourse } from "@/lib/lectures/courses";
import { ICONS, type Icon } from "@/lib/lectures/icons";
import { CourseIcon } from "../../../CourseIcon";

type Data = NonNullable<Awaited<ReturnType<typeof getCourse>>>;

// The lecture page shows dates in Toronto time too; the server render and the browser then agree.
const date = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString("en-US", { ...o, timeZone: "America/Toronto" });
const STATUS: Record<string, string> = { processing: "Writing notes", recording: "Recording", failed: "Notes did not finish" };
const ic = (d: string) => <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;

// mockups/front-row/home/home.html#course (PR #266).
export function Course({ course, saved }: { course: Data; saved: string | null }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [icon, setIcon] = useState<Icon>(course.icon);
  // Which dialog the message belongs to: both stay in the page, only one is open.
  const [note, setNote] = useState<{ on: "PATCH" | "DELETE"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const renameRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const { lectures: all } = course;
  const n = all.length;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  const open = (d: HTMLDialogElement | null) => (setNote(null), setIcon(course.icon), d?.showModal());

  async function send(method: "PATCH" | "DELETE", body?: object) {
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/lecture-courses/${course.id}`, body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method }).catch(() => null);
    setBusy(false);
    // A 404 on DELETE: the course is already gone (another tab), so the student lands Home as on success.
    if (res?.ok || (method === "DELETE" && res?.status === 404)) return true;
    setNote({ on: method, text: res?.status === 409 ? "A lecture is still recording. Stop it first." : "That did not go through. Check your connection and try again." });
    return false;
  }

  async function rename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = (new FormData(e.currentTarget).get("name") as string).trim();
    if (!name) return setNote({ on: "PATCH", text: "Type the course's name first." });
    if (await send("PATCH", { name, icon })) (renameRef.current?.close(), router.refresh());
  }

  return (
    <div className="s-fr-course">
      <div className="bar">
        <Link className="sq" href="/front-row/home" aria-label="Back to courses">{ic("M15 5l-7 7 7 7")}</Link>
        <div className="mw">
          <button className="sq" aria-label="Course options" aria-haspopup="menu" aria-expanded={menu} onClick={(e) => (e.stopPropagation(), setMenu(!menu))}>
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
          </button>
          {menu && (
            <div className="menu" role="menu">
              <button role="menuitem" onClick={() => open(renameRef.current)}>{ic("M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4")}Rename Course</button>
              <button role="menuitem" className="del" onClick={() => open(deleteRef.current)}>{ic("M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3")}Delete Course</button>
            </div>
          )}
        </div>
      </div>

      <div className="chead">
        <div className="ctitle">
          <CourseIcon icon={course.icon} size={80} />
          <div><h1>{course.name}</h1><p className="mute">{n ? `${n} lecture${n === 1 ? "" : "s"} · ${date(all[0].createdAt, { month: "short", day: "numeric" })}` : "No lectures yet"}</p></div>
        </div>
        <Link className="cz-btn rec" href={`/front-row/record?course=${course.id}`}><span>{`Record Lecture ${course.nextNumber}`}</span><span className="cz-btn__arrow" aria-hidden="true"><i className="fr-dot" /></span></Link>
      </div>

      <section className="sec" aria-labelledby="fr-lect">
        <h2 id="fr-lect">Lecture notes</h2>
        <div className="list">
          {n ? all.map((l) => (
            <Link key={l.id} className={`row${l.id === saved ? " new" : ""}`} href={`/front-row/lectures/${l.id}`}>
              <span className="n">{l.number}</span>
              <span>
                <b>{l.title ?? `Lecture ${l.number}`}{l.id === saved && <span className="saved">{ic("M5 12.5l4.5 4.5L19 7.5")}Saved</span>}</b>
                <small>{STATUS[l.status] ?? date(l.createdAt, { weekday: "short", month: "short", day: "numeric" })}</small>
              </span>
              <span className="r">{l.minutes != null && `${l.minutes} min`}</span>
            </Link>
          )) : <p className="mute empty">Record the first lecture. Its notes are saved here, dated.</p>}
        </div>
      </section>

      <dialog ref={renameRef} aria-labelledby="fr-rn">
        <form onSubmit={rename}>
          <h3 id="fr-rn">Rename course</h3>
          <label htmlFor="fr-rn-in">Course name</label>
          <input id="fr-rn-in" name="name" defaultValue={course.name} maxLength={200} autoComplete="off" />
          <p className="lbl" id="fr-rn-ic">Icon</p>
          <div className="icons" role="group" aria-labelledby="fr-rn-ic">
            {ICONS.map((a) => <button key={a} type="button" aria-label={a} aria-pressed={a === icon} onClick={() => setIcon(a)}><CourseIcon icon={a} /></button>)}
          </div>
          {note?.on === "PATCH" && <p role="status">{note.text}</p>}
          <div className="acts"><button type="button" className="ghost" onClick={() => renameRef.current?.close()}>Cancel</button><button className="go" disabled={busy}>Save</button></div>
        </form>
      </dialog>

      <dialog ref={deleteRef} aria-labelledby="fr-dl">
        <h3 id="fr-dl">{`Delete ${course.name}?`}</h3>
        <p>{n ? `Its ${n} lecture${n === 1 ? "" : "s"}, their notes and board photos are deleted for good.` : "It has no lectures yet."}</p>
        {note?.on === "DELETE" && <p role="status">{note.text}</p>}
        <div className="acts">
          <button className="ghost" onClick={() => deleteRef.current?.close()}>Cancel</button>
          <button className="dx" disabled={busy} onClick={async () => { if (await send("DELETE")) router.push("/front-row/home"); }}>Delete Course</button>
        </div>
      </dialog>
    </div>
  );
}
