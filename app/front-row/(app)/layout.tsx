import Link from "next/link";
import { notFound } from "next/navigation";
import { frontRowOpen } from "@/lib/lectures/open";
import { getUser } from "@/lib/supabase/server";
import { me } from "../me";
import { ThemeBoot } from "../ThemeBoot";
import { Tabs } from "./Tabs";
import "../shell.css";

/**
 * Front Row's frame (mockups/front-row/home): sidebar on desktop, bottom tabs on a phone, the theme and the orange ground.
 * One layout for Home, a course and Account, so it stays mounted and a tab tap swaps only <main>.
 * Gated here too: a layout renders beside its page, so the page's own notFound() or sign-in redirect would not stop it.
 */
export default async function Frame({ children }: { children: React.ReactNode }) {
  if (!frontRowOpen((await getUser()).userId ?? undefined)) notFound();
  const { first, last } = await me();
  const name = `${first} ${last}`.trim() || "You";
  const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
  return (
    <div className="frs">
      <ThemeBoot />
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs><linearGradient id="fr-ga" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fcd34d" /><stop offset="1" stopColor="#ea580c" /></linearGradient></defs>
        {/* The Front Row mark: Cadenza's dark tile and gradient line, drawn as a camera. */}
        <symbol id="fr-logo" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#050507" /><path d="M7 12.5a2 2 0 0 1 2-2h2.6l1.6-2.3h5.6l1.6 2.3H23a2 2 0 0 1 2 2V22a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="none" stroke="url(#fr-ga)" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="16" cy="16.8" r="3.6" fill="none" stroke="url(#fr-ga)" strokeWidth="1.8" /><circle cx="16" cy="16.8" r="1.3" fill="url(#fr-ga)" /></symbol>
      </svg>
      <aside className="side">
        <Link className="brand" href="/front-row/home"><svg viewBox="0 0 32 32" aria-hidden="true"><use href="#fr-logo" /></svg>Front Row</Link>
        <nav aria-label="Front Row"><Tabs cls="nav" /></nav>
        <Link className="me" href="/front-row/account"><span className="av">{initials}</span><span><b>{name}</b><small>Settings</small></span></Link>
      </aside>
      <main>{children}</main>
      <nav className="frtabs" aria-label="Front Row"><Tabs cls="tab" /></nav>
    </div>
  );
}
