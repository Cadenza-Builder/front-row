"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { deleteAccount, endSession } from "@/components/Account";

const CHEV = <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>;
const DL = <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;

// Front Row's settings live in localStorage: fr-theme (ThemeBoot reads it before paint), fr-big, fr-camera, fr-awake.
// shortcut: where storage is blocked a setting does not stick (the theme still flips for this page), fine for a preference.
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const onSet = (cb: () => void) => { addEventListener("fr-set", cb); addEventListener("storage", cb); return () => { removeEventListener("fr-set", cb); removeEventListener("storage", cb); }; };
function useSetting(key: string, fallback: string) {
  const value = useSyncExternalStore(onSet, () => read(key) ?? fallback, () => fallback);
  const set = (v: string) => { try { localStorage.setItem(key, v); } catch {} dispatchEvent(new Event("fr-set")); };
  return [value, set] as const;
}

// mockups/front-row/home/home.html#account (PR #266)
export function Account({ first, last, email }: { first: string; last: string; email: string }) {
  const [theme, setTheme] = useSetting("fr-theme", "dark");
  const [big, setBig] = useSetting("fr-big", "");
  const [camera, setCamera] = useSetting("fr-camera", "back");
  const [awake, setAwake] = useSetting("fr-awake", "1");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const name = `${first} ${last}`.trim();

  // Set on the page as well as saved: ThemeBoot's script reads both only on a full load.
  const pickTheme = (t: string) => { document.documentElement.setAttribute("data-theme", t); setTheme(t); };
  const flipBig = () => { document.documentElement.classList.toggle("fr-big", big !== "1"); setBig(big === "1" ? "" : "1"); };
  const sw = (label: string, on: boolean, flip: () => void) => (
    <button type="button" className="sw" role="switch" aria-checked={on} aria-label={label} onClick={flip} />
  );

  async function remove(e: FormEvent) {
    e.preventDefault();
    if (typed !== "DELETE") return;
    setBusy(true);
    setNote("");
    const error = await deleteAccount(typed);
    if (!error) return;
    setBusy(false);
    setNote(error);
  }

  return (
    <section className="s-fr-account">
      <p className="label">Settings</p>
      <h1>Account</h1>
      <div className="acols">
        <div className="sec">
          <h2>Profile</h2>
          <div className="group">
            <Link className="set prof" href="/settings" aria-label={`Edit profile, ${name}`}>
              <span className="ini" aria-hidden="true">{`${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?"}</span>
              <span className="l"><b>{name}</b><small>{email}</small></span>{CHEV}
            </Link>
          </div>
        </div>
        <div className="sec">
          <h2>Appearance</h2>
          <div className="group">
            <div className="set"><span className="l">Theme</span>
              <span className="seg" role="group" aria-label="Theme">
                {["dark", "light"].map((t) => (
                  <button key={t} type="button" aria-pressed={theme === t} onClick={() => pickTheme(t)}>{t === "dark" ? "Dark" : "Light"}</button>
                ))}
              </span>
            </div>
            <div className="set"><span className="l">Larger text<small>Bigger type on every screen</small></span>{sw("Larger text", big === "1", flipBig)}</div>
          </div>
        </div>
        <div className="sec">
          <h2>Recording</h2>
          <div className="group">
            <button type="button" className="set" aria-label={`Camera, ${camera === "back" ? "Back" : "Front"}`} onClick={() => setCamera(camera === "back" ? "front" : "back")}>
              <span className="l">Camera<small>The one pointed at the board</small></span><span className="v">{camera === "back" ? "Back" : "Front"}</span>{CHEV}
            </button>
            <div className="set"><span className="l">Keep screen awake<small>While a lecture records</small></span>{sw("Keep screen awake", awake === "1", () => setAwake(awake === "1" ? "" : "1"))}</div>
          </div>
        </div>
        <div className="sec">
          <h2>Your data</h2>
          <div className="group">
            <a className="set" href="/api/account/export"><span className="l">Download my data<small>Your account as one file. Lecture notes are not in it yet.</small></span>{DL}</a>
            <Link className="set" href="/privacy"><span className="l">Privacy Policy</span>{CHEV}</Link>
            <Link className="set" href="/terms"><span className="l">Terms of Use</span>{CHEV}</Link>
          </div>
        </div>
        <div className="sec">
          <h2>Sign in</h2>
          <div className="group">
            <button type="button" className="set" onClick={() => endSession("local")}>Sign Out</button>
            <button type="button" className="set danger" onClick={() => dialog.current?.showModal()}>Delete Account</button>
          </div>
        </div>
      </div>
      <p className="legal">© 2026 Study Cadenza Inc. All rights reserved.</p>

      <dialog ref={dialog} className="fr-dialog" aria-labelledby="fr-del-h" onClose={() => (setTyped(""), setNote(""))}>
        <form onSubmit={remove}>
          <h3 id="fr-del-h">Delete your account?</h3>
          <p>Every course, lecture, note and board photo is deleted for good.</p>
          <label htmlFor="fr-del-in">Type DELETE to confirm</label>
          <input id="fr-del-in" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoComplete="off" />
          {note && <p role="alert">{note}</p>}
          <div className="acts">
            <button type="button" className="ghost" onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="dx" disabled={typed !== "DELETE" || busy}>{busy ? "Deleting" : "Delete Account"}</button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
