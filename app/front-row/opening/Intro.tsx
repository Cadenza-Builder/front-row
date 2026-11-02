"use client";

import { useState, useSyncExternalStore } from "react";
import { Mark } from "./Mark";
import "./opening.css";

// Decided once per page load, so the intro that is playing never flips off when sessionStorage is written.
let play: boolean | undefined;
function decide() {
  if (play === undefined) {
    try {
      play = !sessionStorage.getItem("fr-intro") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (play) sessionStorage.setItem("fr-intro", "1");
    } catch {
      play = false;
    }
  }
  return play;
}
const still = () => () => {};

// Take A · Draw (mockups/front-row/home/home.html?intro=a): the camera draws itself, then the words, about 2.6s.
// The server renders it (no frame of Home before it); a visitor who saw it this session gets one dark frame at most.
export function Intro() {
  const on = useSyncExternalStore(still, decide, () => true);
  const [done, setDone] = useState(false);
  if (!on || done) return null;
  function end() {
    play = false; // back to Home without a reload: not again
    setDone(true);
  }
  return (
    <div className="fr-intro" onAnimationEnd={(e) => e.animationName === "fr-out" && end()}>
      <Mark className="cam" />
      <h1><span className="lt">Welcome to</span> Front Row</h1>
      {/* eslint-disable-next-line @next/next/no-img-element -- the Cadenza mark, a small SVG */}
      <p>by <img src="/favicon.svg" alt="" /><b>Cadenza</b></p>
    </div>
  );
}
