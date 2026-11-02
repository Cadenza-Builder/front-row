"use client";

import { useLayoutEffect } from "react";

// The saved theme (dark unless "light") and Larger text, on <html>. The inline script sets them before paint on a full
// page load; the effect sets them after a client navigation (sign-in → Home), where React runs no inline script.
function apply() {
  try {
    const d = document.documentElement;
    d.dataset.theme = localStorage.getItem("fr-theme") === "light" ? "light" : "dark";
    d.classList.toggle("fr-big", localStorage.getItem("fr-big") === "1");
  } catch {}
}

export function ThemeBoot() {
  useLayoutEffect(apply, []);
  return <script dangerouslySetInnerHTML={{ __html: `(${apply})()` }} />;
}
