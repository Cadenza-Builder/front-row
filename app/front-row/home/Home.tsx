"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { type Course, usuallyNow } from "./now";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CUT = ["0 0,80% 0,0 60%", "0 0,100% 0,0 40%", "0 0,60% 0,0 80%"];
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
// The notebook cover: "ECO220" is ECO over 220, "Grade 11 Chemistry" is Grade over 11; otherwise the words' initials.
const cover = (name: string) => name.match(/^([A-Za-z]+)\s*(\d+)/)?.slice(1) ?? [name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase(), ""];
const record = (c: Course) => `/front-row/record?course=${c.id}`;
const DOT = <span className="rdot" aria-hidden="true" />;
// Aa, kept in localStorage `fr-big`; `mem` stands in where storage is blocked (it then lasts until the page closes).
let mem = false;
const readBig = () => { try { return localStorage.getItem("fr-big") === "1"; } catch { return mem; } };
const onBig = (cb: () => void) => { addEventListener("fr-big", cb); addEventListener("storage", cb); return () => { removeEventListener("fr-big", cb); removeEventListener("storage", cb); }; };

// mockups/front-row/keep.html (take A · One Thing): a calm screen for a student who may not see well. One column read top
// to bottom, the next lecture first and largest, 20px+ text, 64px+ targets. Aa grows every rem by a quarter and stays.
export function Home({ initials, name }: { initials: string; name: string }) {
  // `now`: when the list arrived, the moment "usually now" is judged at.
  const [data, setData] = useState<{ courses: Course[]; now: Date } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [other, setOther] = useState(false);
  const big = useSyncExternalStore(onBig, readBig, () => false);
  const courses = data?.courses;

  useEffect(() => {
    fetch(`/api/lecture-courses?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { courses: Course[] }) => setData({ courses: d.courses, now: new Date() }))
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("fr-big", big);
    return () => document.documentElement.classList.remove("fr-big");
  }, [big]);
  const aa = () => {
    mem = !big;
    try { localStorage.setItem("fr-big", mem ? "1" : ""); } catch {}
    dispatchEvent(new Event("fr-big"));
  };

  const usual = data && !other ? usuallyNow(data.courses, data.now) : null;
  // The chips put the course recorded last first; the rows keep the list's order.
  const chips = courses ?? []; // the API sends them last used first
  const chosen = chips.find((c) => c.id === pick) ?? chips[0];

  return (
    <div className="s-fr-home">
      <header className="bar">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 32px SVG, as in the mockup */}
        <Link className="logo" href="/front-row"><img src="/favicon.svg" alt="" />Front Row</Link>
        <button className="btn-round" aria-pressed={big} aria-label="Larger text" onClick={aa}>Aa</button>
        <Link className="btn-round" href="/settings" aria-label={`Account, ${name}`}>{initials}</Link>
      </header>
      <main><div className="wrap">
        {usual ? (
          <section className="next" aria-labelledby="fr-next">
            <p className="label">{`${DAYS[usual.usual!.weekday]} · ${hm(usual.usual!.minutes)}`}</p>
            <div><h1 id="fr-next"><span className="light">{`${usual.name},`}</span> <span className="cz-grad">usually now.</span></h1>
              <p className="sub">{`You record it ${DAYS[usual.usual!.weekday]}s at ${hm(usual.usual!.minutes)}. This will be Lecture ${(usual.lastLecture?.number ?? 0) + 1}.`}</p></div>
            <Link className="big-btn" href={record(usual)}>{DOT}Record This Lecture</Link>
            <button className="other" onClick={() => setOther(true)}>A different class?</button>
          </section>
        ) : chosen && (
          <section className="next" aria-labelledby="fr-which">
            <p className="label">Record a lecture</p>
            <div><h1 id="fr-which"><span className="light">Which</span> <span className="cz-grad">class?</span></h1><p className="sub">Front Row dates and titles it for you.</p></div>
            <div className="chips" role="radiogroup" aria-label="Course">
              {chips.map((c) => (
                <label key={c.id} className="chip"><input type="radio" name="fr-course" checked={c.id === chosen.id} onChange={() => setPick(c.id)} />{c.name}</label>
              ))}
            </div>
            <Link className="big-btn" href={record(chosen)}>{DOT}<span>{`Record ${chosen.name}`}</span></Link>
          </section>
        )}
        <section aria-labelledby="fr-courses">
          <h2 className="sec" id="fr-courses">Your courses</h2>
          {failed && <p className="sub" role="status">Your courses did not load. Check your connection and open this page again.</p>}
          <div className="rows">
            {courses?.map((c, i) => {
              const [a, b] = cover(c.name), l = c.lastLecture;
              return (
                <Link key={c.id} className="row" href={l ? `/front-row/lectures/${l.id}` : record(c)}>
                  <span className="nb lg" style={{ "--cut": `polygon(${CUT[i % 3]})` } as CSSProperties}><span>{a}<br />{b}</span></span>
                  <span><b>{c.name}</b><span>{l ? `Last notes: Lecture ${l.number}${l.title ? `, ${l.title}` : ""}, ${day(l.createdAt)}` : "No notes yet"}</span></span>
                  <span className="go">{l ? "Open →" : "Record →"}</span>
                </Link>
              );
            })}
            <Link className="row" href="/front-row/tour">
              <span className="nb lg add" style={{ "--cut": "polygon(0 0,90% 0,0 50%)" } as CSSProperties}><span>+</span></span>
              <span><b>Add a course</b><span>Just its name. A syllabus is optional.</span></span>
              <span className="go">Add →</span>
            </Link>
          </div>
        </section>
      </div></main>
    </div>
  );
}
