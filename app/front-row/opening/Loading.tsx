"use client";

import { useEffect, useState } from "react";
import { Mark } from "./Mark";
import "./opening.css";

// After sign-in (?welcome=1): the mark breathes over a 1.3s bar, then Home rises in (html.fr-enter in opening.css).
export function Loading() {
  const [done, setDone] = useState(false);
  // Drop ?welcome=1 so a reload does not play it again; this is the session's opening, so the intro is spent too.
  useEffect(() => {
    history.replaceState(history.state, "", location.pathname);
    try { sessionStorage.setItem("fr-intro", "1"); } catch {}
  }, []);
  if (done) return null;
  function end() {
    setDone(true);
    const html = document.documentElement;
    html.classList.add("fr-enter");
    setTimeout(() => html.classList.remove("fr-enter"), 1200);
  }
  return (
    <div className="fr-load" onAnimationEnd={(e) => e.animationName === "fr-out" && end()}>
      <Mark className="cam" />
      <div className="bar"><i /></div>
      <p>Opening your courses</p>
    </div>
  );
}
