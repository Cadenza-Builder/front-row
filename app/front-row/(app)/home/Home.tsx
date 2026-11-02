"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ICONS, type Icon } from "@/lib/lectures/icons";
import { addCourse } from "../../addCourse";
import { CourseIcon } from "../../CourseIcon";

// listCourses (lib/lectures/courses.ts), the fields Home reads.
export type Course = { id: string; name: string; icon: Icon; lectureCount: number; lastLecture: { createdAt: string } | null };
export type Recent = { id: string; courseName: string; icon: Icon; number: number; title: string | null; createdAt: string; minutes: number | null };

export const greeting = (hour: number) => (hour >= 5 && hour < 12 ? "Good morning," : hour >= 12 && hour < 18 ? "Good afternoon," : "Good evening,");
const date = (iso: string | number, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString("en-US", o);
const noop = () => () => {};
const PLUS = <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;

// mockups/front-row/home/home.html#home: a greeting, one row of course cards, then the newest notes.
export function Home({ first, initials, data: { courses, recent } }: { first: string; initials: string; data: { courses: Course[]; recent: Recent[] } }) {
  const router = useRouter();
  const [icon, setIcon] = useState<Icon>("book");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const name = useRef<HTMLInputElement>(null);
  // The student's clock, not the server's: 0 while server rendering, so the greeting waits for the browser.
  const now = useSyncExternalStore(noop, () => Math.floor(Date.now() / 60000) * 60000, () => 0);

  function open() {
    setIcon(ICONS[courses.length % ICONS.length]);
    setNote("");
    if (name.current) name.current.value = "";
    dialog.current?.showModal();
    name.current?.focus();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const value = name.current?.value.trim() ?? "";
    if (!value) return name.current?.focus();
    setBusy(true);
    const { course, note: why } = await addCourse(value, null, icon);
    if (course) {
      router.refresh(); // the list came from the server: Back from the new course must show it
      return router.push(`/front-row/courses/${course.id}`); // stays busy: no second course while it opens
    }
    setNote(why);
    setBusy(false);
  }

  const addButton = (where: string) => (
    <button className={`cz-btn ${where}`} type="button" onClick={open}><span className="cz-btn__label">Add Course</span><span className="cz-btn__arrow">{PLUS}</span></button>
  );

  return (
    <div className="s-fr-home">
      <div className="topbar">
        <svg className="pmark" viewBox="0 0 32 32" aria-hidden="true"><use href="#fr-logo" /></svg>
        {addButton("addtop")}
        <Link className="avbtn" href="/front-row/account" aria-label="Account">{initials}</Link>
      </div>
      <div className="hello" style={now ? undefined : { visibility: "hidden" }}>
        <p className="label">{now ? date(now, { weekday: "long", month: "long", day: "numeric" }) : "Today"}</p>
        <h1><span className="light">{greeting(now ? new Date(now).getHours() : 9)}</span> {`${first}.`}</h1>
      </div>

      <section className="sec" aria-labelledby="fr-courses">
        <div className="head"><h2 id="fr-courses">Your courses</h2>{courses.length ? addButton("addsec") : null}</div>
        {courses.length === 0 && (
          <div className="first">
            <div>
              <h3><span className="light">Your first lecture</span><br />starts here.</h3>
              <p>Front Row listens in class, reads the board and writes your notes. Three steps, once.</p>
              {addButton("addfirst")}
            </div>
            <ol className="steps">
              <li><span className="n">1</span><span><b>Add a course</b><small>ECO101, with an icon you will spot</small></span></li>
              <li><span className="n">2</span><span><b>Record the lecture</b><small>Phone on the desk, camera on the board</small></span></li>
              <li><span className="n">3</span><span><b>Get the notes</b><small>Written and dated in the course</small></span></li>
            </ol>
          </div>
        )}
        <div className="grid">
          {courses.map((c) => (
            <Link key={c.id} className="course" href={`/front-row/courses/${c.id}`}>
              <CourseIcon icon={c.icon} />
              <span><b>{c.name}</b><small>{c.lectureCount && c.lastLecture
                ? `${c.lectureCount} lecture${c.lectureCount === 1 ? "" : "s"} · ${date(c.lastLecture.createdAt, { month: "short", day: "numeric" })}`
                : "No lectures yet"}</small></span>
            </Link>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="sec" aria-labelledby="fr-recent">
          <div className="head"><h2 id="fr-recent">Recent notes</h2></div>
          <div className="list">
            {recent.map((r) => (
              <Link key={r.id} className="row" href={`/front-row/lectures/${r.id}`}>
                <CourseIcon icon={r.icon} size={40} />
                <span><b>{r.title ?? `Lecture ${r.number}`}</b><small>{`${r.courseName} · Lecture ${r.number} · ${date(r.createdAt, { weekday: "short", month: "short", day: "numeric" })}`}</small></span>
                {r.minutes !== null && <span className="r">{`${r.minutes} min`}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <dialog ref={dialog} className="fr-dialog" aria-labelledby="fr-new">
        <form onSubmit={add}>
          <h3 id="fr-new">New course</h3>
          <label htmlFor="fr-name">Course name</label>
          <input id="fr-name" ref={name} placeholder="ECO101" maxLength={200} autoComplete="off" />
          <p className="lab" id="fr-icon">Icon</p>
          <div className="icons" role="group" aria-labelledby="fr-icon">
            {ICONS.map((i) => (
              <button key={i} type="button" aria-label={i} aria-pressed={i === icon} onClick={() => setIcon(i)}><CourseIcon icon={i} /></button>
            ))}
          </div>
          {note && <p className="note" role="status">{note}</p>}
          <div className="acts">
            <button className="ghost" type="button" onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="go" type="submit" disabled={busy}>{busy ? "Adding…" : "Add Course"}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
