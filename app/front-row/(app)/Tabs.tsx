"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RecordLink } from "../RecordLink";

const TABS = [
  { key: "home", href: "/front-row/home", label: "Courses", icon: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></> },
  { key: "record", href: "/front-row/record", label: "Record", icon: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" fill="currentColor" /></> },
  { key: "account", href: "/front-row/account", label: "Account", icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5" /></> },
] as const;

/** The frame's tabs. The frame stays mounted across tabs, so the lit one follows the URL here, not a prop from each page. */
export function Tabs({ cls }: { cls: string }) {
  // Home and a course page light Courses; the recorder is outside this frame.
  const active = usePathname().startsWith("/front-row/account") ? "account" : "home";
  return TABS.map((t) => {
    const inner = <><svg className="ic" viewBox="0 0 24 24" aria-hidden="true">{t.icon}</svg>{t.label}</>;
    // Record asks which course first: the recorder needs one.
    if (t.key === "record") return <RecordLink key={t.key} className={cls}>{inner}</RecordLink>;
    return <Link key={t.key} className={cls} href={t.href} aria-current={t.key === active ? "page" : undefined}>{inner}</Link>;
  });
}
