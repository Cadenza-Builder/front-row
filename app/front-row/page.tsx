import type { Metadata } from "next";
import Link from "next/link";
import { frontRowOpen } from "@/lib/lectures/open";
import { getUser } from "@/lib/supabase/server";
import { LandingMotion } from "../LandingMotion";
import { RequestAccess } from "./RequestAccess";
import "../screen-landing.css";
import "./screen-front-row.css";

export const metadata: Metadata = {
  title: "Front Row",
  description: "Point your phone at the board. Front Row reads the board, hears the lecture and writes the notes.",
};

const TICK = ["Board Read", "Maths Typed Out", "Every Word Heard", "Sections Written", "Exam Hints Flagged", "Saved to Cadenza"];
const SAY = "Every AI note-taker listens. Front Row also watches: the board, the maths as it is written, and the moment your professor says it will be on the exam. You stay in the lecture, not behind a laptop.".split(" ");
const FAQ: [string, string][] = [
  ["What is Front Row?", "Front Row turns a lecture into notes. Your phone faces the board; Front Row reads the board, hears the lecture and writes notes with sections, the maths as written and exam hints."],
  ["Does it record video?", "No. It keeps the audio and a photo of the board when the board changes. The audio is deleted once your notes are written."],
  ["Can I record any lecture?", "Only if your accessibility office has approved it for you."],
  ["What do I need?", "A phone with a view of the board, and somewhere to lean it. Plugged in is best for a long lecture."],
  ["Where do my notes go?", "They stay in Front Row under the course. You can download them as PDF or Word, or add them to a week in Cadenza so your lesson and practice use them."],
];
const ARROW = (s: number) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>;
const SAMPLE = "/front-row/sample";

// mockups/front-row/find.html (take B · Viewfinder): the Cadenza landing's markup and motion with Front Row's words and drawings.
export default async function FrontRowLanding() {
  const { userId } = await getUser();
  const start = userId ? "/front-row/home" : "/sign-in?from=front-row";
  // Recording is closed to the public (docs/front-row-request-access-plan.md): everyone else asks for access.
  const open = frontRowOpen(userId ?? undefined);
  return (
    <div className="s-landing fr-landing">
      <nav className="cz-nav cz-nav--fixed" aria-label="Main">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 24px SVG, as in the mockup */}
        <Link className="cz-nav__logo" href="/"><img src="/favicon.svg" alt="" />Front Row <small>by Cadenza</small></Link>
        <a className="cz-nav__link" href="#how">How It Works</a>
        <a className="cz-nav__link" href="#privacy">Privacy</a>
        <a className="cz-nav__link" href="#faq">FAQ</a>
        {open ? <Link className="cz-btn cz-btn--ghost cz-btn--plain cz-nav__cta" href={start}>My Lectures</Link> : <a className="cz-btn cz-btn--ghost cz-btn--plain cz-nav__cta" href="#request">Request Access</a>}
      </nav>

      <header className="frh">
        <div className="vfr" aria-hidden="true"><i /><i /><i /><i /><span className="rec"><b />REC <time id="tc">00:14:20</time></span><span className="meta">Board found · Sound good</span></div>
        <div className="copy">
          <div className="found"><span className="lab">Board</span>
            <h1 className="display"><span className="light">Notes that</span><br /><span className="cz-grad">watch the board.</span></h1>
          </div>
          <p className="lead">Point your phone at the board. Front Row writes the notes.</p>
          {open ? <div className="cta"><Link className="cz-btn cz-btn--shimmer" href={start}><span className="cz-btn__label">Record a Lecture</span><span className="cz-btn__arrow">{ARROW(16)}</span></Link><Link className="cz-btn cz-btn--ghost" href={SAMPLE}>See Sample Notes</Link></div> : <RequestAccess sample={SAMPLE} />}
        </div>
      </header>

      <div className="sheet">
        <section id="what" data-scroll="pin">
          <div className="pin"><div className="box">
            <div className="headrow">
              <div><p className="label">Built from your lecture</p><h2 className="h1"><span className="light">Inside</span> <span className="cz-grad">your notes</span></h2></div>
              <div><p className="sub">Front Row reads the board, hears every word and writes the hour up as notes you can study from.</p></div>
            </div>
            <div className="split">
              <div className="draw"><svg id="kit" viewBox="140 60 540 480" preserveAspectRatio="xMidYMid meet" role="img" aria-label="A board being read, a sound wave becoming text, a page of numbered notes and a flag, drawn in fine lines"></svg></div>
              <div className="feats" id="feats" role="group" aria-label="What your notes hold">
                <button className="on"><span className="h3">Board Read</span><span className="more"><span>Each time the board changes, it is read, maths and all, into your notes.</span></span><i><b></b></i></button>
                <button><span className="h3">Every Word Heard</span><span className="more"><span>The whole lecture as a transcript, so nothing said is lost.</span></span><i><b></b></i></button>
                <button><span className="h3">Sections Written</span><span className="more"><span>The hour split into sections, each with the few points that matter.</span></span><i><b></b></i></button>
                <button><span className="h3">Exam Hints</span><span className="more"><span>When your professor says it will be on the exam, it is flagged.</span></span><i><b></b></i></button>
              </div>
            </div>
          </div></div>
        </section>
        <section id="how" data-scroll="pin">
          <div className="pin"><div className="box">
            <div className="headrow">
              <div><p className="label">How it works</p><h2 className="h1"><span className="light">A note-taker that sits</span> <span className="cz-grad">in the front row.</span></h2></div>
              <div>
                <p className="sub">Prop your phone facing the board. Front Row listens, watches the board, and writes the notes when class ends.</p>
                <a className="see" href="#steps">See How It Works {ARROW(14)}</a>
              </div>
            </div>
            <div className="ticker" aria-hidden="true"><div>{[...TICK, ...TICK, ...TICK, ...TICK].map((t, i) => <span key={i}>{t}</span>)}</div></div>
            <div className="split">
              <div className="draw"><svg id="hall" viewBox="0 0 800 600" preserveAspectRatio="xMidYMax meet" role="img" aria-label="The front of a lecture hall drawn in fine lines: a board with maths and a plot, a lectern, and a phone on a stand facing the board"></svg></div>
              <div className="say">
                <div className="words">
                  <p className="label">Your lecture, written down</p>
                  <p className="big">{SAY.map((w, i) => <span key={i} data-t={`${.12 + i / SAY.length * .7} ${.18 + i / SAY.length * .7}`}>{w} </span>)}</p>
                  <Link className="cz-btn cz-btn--ghost cz-btn--plain" href={SAMPLE}>See Sample Notes</Link>
                </div>
              </div>
            </div>
            <div className="with">
              <div className="cells"><div>iPhone</div><div>Android</div><div className="soon">Room Camera <small>Soon</small></div></div>
              <p>Any lecture hall, any seat with a view of the board · No video is ever stored.</p>
            </div>
          </div></div>
        </section>
        <section className="steps" id="steps" data-scroll="in">
          <div>
            <p className="tag">Prop <b>[01]</b></p>
            <svg viewBox="0 0 120 120" data-t="0 .35"><rect pathLength={1} x="42" y="14" width="36" height="66" rx="7" /><path pathLength={1} d="M60 80v26M44 106h32" /><circle className="hot" pathLength={1} cx="60" cy="26" r="3" /></svg>
            <div><h3 className="h3">Prop your phone</h3><p>Lean it on your bag or a stand, facing the board. It finds the board and the professor by itself.</p></div>
          </div>
          <div>
            <p className="tag">Record <b>[02]</b></p>
            <svg viewBox="0 0 120 120" data-t=".15 .5"><circle pathLength={1} cx="60" cy="60" r="40" /><circle className="hot" pathLength={1} cx="60" cy="60" r="14" /><path pathLength={1} d="M60 8v8M60 104v8M8 60h8M104 60h8" /></svg>
            <div><h3 className="h3">Press record</h3><p>Then listen. It hears every word and reads the board each time it changes.</p></div>
          </div>
          <div>
            <p className="tag">Read <b>[03]</b></p>
            <svg viewBox="0 0 120 120" data-t=".3 .65"><rect pathLength={1} x="24" y="12" width="72" height="96" rx="6" /><path className="hot" pathLength={1} d="M38 32h44" /><path pathLength={1} d="M38 50h44M38 64h36M38 82h44M38 96h28" /></svg>
            <div><h3 className="h3">Read the notes</h3><p>Minutes after class: sections, the maths as written and what was flagged for the exam.</p></div>
          </div>
        </section>
        <section className="wrap" id="schools">
          <div className="box">
            <div className="headrow">
              <div><p className="label">For accessibility offices</p><h2 className="h1"><span className="light">No more waiting</span> <span className="cz-grad">for a note-taker.</span></h2></div>
              <div><p className="sub">Give Front Row to every student who needs notes, from the first lecture of term.</p><a className="see" href="mailto:support@studycadenza.com">Write to Us {ARROW(14)}</a></div>
            </div>
            <p className="priv" id="privacy"><strong>Your lectures stay yours.</strong> No video is ever stored. Audio is deleted once your notes are written, and your notes are private to you. <a href="/privacy">Read the Privacy Policy</a>.</p>
          </div>
        </section>
        <section className="wrap" id="faq">
          <div className="box">
            <div className="headrow">
              <div><p className="label">FAQ</p><h2 className="h1"><span className="light">Questions,</span> <span className="cz-grad">answered.</span></h2></div>
              <div><p className="sub">Still wondering about something? Write to <a href="mailto:support@studycadenza.com">support@studycadenza.com</a>.</p></div>
            </div>
            <div className="qa" data-scroll="in">
              {FAQ.map(([q, a], i) => (
                <details key={q} name="faq" open={i === 0} data-t={`${i * .06} ${.3 + i * .06}`}><summary><h3 className="h3">{q}</h3><i aria-hidden="true"></i></summary><b className="bar"></b><p>{a}</p></details>
              ))}
            </div>
          </div>
        </section>
      </div>
      <footer className="cz-footer">
        <span className="cz-footer__brand">Study Cadenza Inc.</span>
        <a href="#privacy">Privacy</a><a href="/terms">Terms</a><Link href="/">Cadenza</Link>
        <a href="mailto:support@studycadenza.com">support@studycadenza.com</a>
        <p className="cz-footer__legal">© 2026 Study Cadenza Inc. All rights reserved.</p>
      </footer>
      <LandingMotion frontRow />
    </div>
  );
}
