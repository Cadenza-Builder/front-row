"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";

const TIPS = [
  ["Start with a course.", "Every lecture you record lands in a course."],
  ["Just the name.", "A syllabus is optional. Add one and Front Row knows your class times and topics from day one."],
  ["Record each lecture.", "Tap Record when class starts. Each lecture is dated and titled for you."],
];
const LOCKS = ["Start here", "Just the name", "Record"];
const UP = <svg className="ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 16V5M7 10l5-5 5 5M5 19h14" /></svg>;

// mockups/front-row/tour.html (take A · Lock On): the page dims, the viewfinder box locks onto one thing, a tip beside it.
// 1 Start with a course, 2 just its name (POST /api/lecture-courses, then the optional syllabus), 3 Record Lecture 1.
export function Tour({ first }: { first: string }) {
  const router = useRouter();
  const [at, setAt] = useState(0);
  const [course, setCourse] = useState<{ id: string; name: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const lock = useRef<HTMLDivElement>(null), tip = useRef<HTMLDivElement>(null), name = useRef<HTMLInputElement>(null);
  const recordHref = course ? `/front-row/record?course=${course.id}` : "";

  // The box follows the screen's [data-lock]; the tip sits to the right when there is room, else below, else above.
  useLayoutEffect(() => {
    const place = () => {
      const t = document.querySelector(".s-fr-tour main [data-lock]"), l = lock.current, p = tip.current;
      if (!t || !l || !p) return;
      const r = t.getBoundingClientRect(), pad = 10;
      Object.assign(l.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      const right = innerWidth - r.right > 400, below = r.bottom + 34 + p.offsetHeight < innerHeight - 90;
      p.style.left = `${right ? r.right + 34 : Math.max(16, Math.min(r.left, innerWidth - p.offsetWidth - 16))}px`;
      p.style.top = `${right ? r.top : below ? r.bottom + 34 : Math.max(16, r.top - p.offsetHeight - 44)}px`;
    };
    place();
    addEventListener("resize", place);
    addEventListener("scroll", place, { passive: true });
    return () => { removeEventListener("resize", place); removeEventListener("scroll", place); };
  }, [at, note]);
  useEffect(() => { if (at === 1) name.current?.focus(); }, [at]);

  async function save() {
    const value = name.current?.value.trim() ?? "";
    if (!value) { setNote("Type the course's name first."); name.current?.focus(); return; }
    setBusy(true);
    setNote("");
    const res = await fetch("/api/lecture-courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: value }) }).catch(() => null);
    const made: { id?: string; name?: string } | null = res?.ok ? await res.json().catch(() => null) : null;
    if (!made?.id) { setBusy(false); setNote("That did not save. Try again in a moment."); return; }
    // The syllabus is optional: the course stands even when reading it fails, and it can be added again later.
    if (file) {
      const body = new FormData();
      body.append("file", file);
      const up = await fetch(`/api/lecture-courses/${made.id}/syllabus`, { method: "POST", body }).catch(() => null);
      if (!up?.ok) setNote("The syllabus did not upload. You can add it later.");
    }
    setCourse({ id: made.id, name: made.name ?? value });
    setBusy(false);
    setAt(2);
  }

  function next(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (at === 0) setAt(1);
    else if (at === 1) void save();
    else router.push(recordHref);
  }

  return (
    <div className="s-fr-tour">
      <div className="top">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 22px SVG, as in the mockup */}
        <Link className="back" href="/front-row"><span className="tile"><img src="/favicon.svg" alt="" width={22} /></span><span><b>Front Row</b></span></Link>
      </div>
      <main>
        {at === 0 && (
          <section>
            <p className="label">{first ? `Welcome, ${first}` : "Welcome"}</p>
            <h1><span className="light">Your</span> <span className="cz-grad">lectures.</span></h1>
            <div className="empty"><button className="add" data-lock onClick={() => setAt(1)}><span className="plus">+</span><b>Record for a Course</b><span>Add the course, then record each lecture.</span></button><div className="ghostcard" /></div>
          </section>
        )}
        {at === 1 && (
          <section>
            <p className="label">Record for a Course</p>
            <h1><span className="light">Which</span> <span className="cz-grad">course?</span></h1>
            <form className="sheet" data-lock onSubmit={next}>
              <label className="fld"><span>Course name</span><input ref={name} className="cz-field" placeholder="ECO220, or Grade 11 Chemistry" maxLength={200} /></label>
              <label className="opt">{UP}<span><b>{file ? file.name : "Add a syllabus (optional)"}</b><br />Fills in your class times and topics. You can add it later.</span>
                <input type="file" accept=".pdf,.docx" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
            </form>
          </section>
        )}
        {at === 2 && course && (
          <section>
            <p className="label">{course.name} · No lectures yet</p>
            <h1><span className="light">{course.name}</span> <span className="cz-grad">lectures.</span></h1>
            <div className="lec">
              <div className="today"><time>Today</time><span><b>Lecture 1</b><small>Dated now, titled from what was taught</small></span><Link className="recbtn" href={recordHref} data-lock><i />Record</Link></div>
              <div className="ghost"><time>Next class</time><span><b>Lecture 2</b><small>After two recordings, Front Row learns when this class meets</small></span><span className="later">Soon</span></div>
            </div>
          </section>
        )}
      </main>
      <div className="lockon" ref={lock} aria-hidden="true"><span>{LOCKS[at]}</span></div>
      <div className="tip glass" ref={tip} role="dialog" aria-label="Guided tour">
        <p className="hud">{at + 1} of 3</p>
        <b>{TIPS[at][0]}</b>
        <p>{TIPS[at][1]}</p>
        {note && <p className="note" role="status">{note}</p>}
        <div className="row"><Link className="skip" href="/front-row/home">Skip</Link><button className="cz-btn" onClick={() => next()} disabled={busy}>{at === 2 ? "Record" : "Next"}</button></div>
      </div>
    </div>
  );
}
