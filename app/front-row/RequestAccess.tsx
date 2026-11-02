"use client";

import Link from "next/link";
import { useState } from "react";

const ARROW = <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>;
const CHECK = <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 5" /></svg>;

// mockups/front-row/request-access (take A · Inline Email): the hero's CTA while Front Row is closed to this visitor.
export function RequestAccess({ sample }: { sample: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "bad" | "full" | "failed">("idle");
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy");
    const email = new FormData(e.currentTarget).get("email");
    const res = await fetch("/api/front-row/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    setState(res?.ok ? "sent" : res?.status === 400 ? "bad" : res?.status === 429 ? "full" : "failed");
  }
  return (
    <div className="ra" id="request">
      {state === "sent" ? (
        <p className="ra-done" role="status">{CHECK}<span>You&apos;re on the list. We&apos;ll email you when it&apos;s your turn.</span></p>
      ) : (
        <form className="ra-inline" onSubmit={send}>
          <input type="email" name="email" placeholder="Your email" aria-label="Your email" autoComplete="email" maxLength={254} required />
          <button type="submit" className="cz-btn cz-btn--shimmer" disabled={state === "busy"}><span className="cz-btn__label">Request Access</span><span className="cz-btn__arrow">{ARROW}</span></button>
        </form>
      )}
      <p className="ra-note" aria-live="polite">
        {state === "bad" ? "Check your email address." : state === "full" ? "Lots of requests today. Try again tomorrow." : state === "failed" ? "That didn't go through. Try again." : <>Opening to a few students at a time. <Link href={sample}>See sample notes</Link></>}
      </p>
    </div>
  );
}
