"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { Icon } from "@/lib/lectures/icons";
import { CourseIcon } from "./CourseIcon";

type Course = { id: string; name: string; icon: Icon; lectureCount: number; lastLecture: { createdAt: string } | null };

// The Record tab (mockups/front-row/polish/polish.html, "Record tab"): the recorder needs a course, so one course
// goes straight to it, none goes Home to add one, and several open "Record which course?".
export function RecordLink({ className, children }: { className: string; children: ReactNode }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId(); // the frame renders this twice (sidebar and phone tabs)
  const close = () => dialog.current?.close();
  const [courses, setCourses] = useState<Course[]>([]);
  const asked = useRef<Promise<Course[]> | null>(null);

  // Asked on the finger's touch, so the list is on its way before the click lands; the click reuses the answer.
  function ask() {
    return (asked.current = fetch("/api/lecture-courses").then((r) => (r.ok ? r.json() : null)).then((b) => b?.courses ?? []).catch(() => []));
  }

  async function pick(e: MouseEvent) {
    e.preventDefault();
    const list = await (asked.current ?? ask()); // a keyboard press has no touch first
    asked.current = null;
    if (list.length === 1) return router.push(`/front-row/record?course=${list[0].id}`);
    if (!list.length) return router.push("/front-row/home");
    setCourses(list);
    dialog.current?.showModal();
  }

  return (
    <>
      <a className={className} href="/front-row/record" onPointerDown={ask} onPointerCancel={() => (asked.current = null)} onClick={pick}>{children}</a>
      <dialog ref={dialog} className="fr-pick" aria-labelledby={heading} onClick={(e) => e.target === dialog.current && close()}>
        <h3 id={heading}>Record which course?</h3>
        <p>Pick one and the camera opens. Your notes land in that course.</p>
        {courses.map((c) => (
          <Link key={c.id} className="pickrow" onClick={close} href={`/front-row/record?course=${c.id}`}>
            <CourseIcon icon={c.icon} size={48} />
            <span><b>{c.name}</b><small>{c.lectureCount && c.lastLecture
              ? `${c.lectureCount} lecture${c.lectureCount === 1 ? "" : "s"} · Last ${new Date(c.lastLecture.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : "No lectures yet"}</small></span>
            <span className="go"><i />Record</span>
          </Link>
        ))}
        <div className="foot">
          <Link className="addc" href="/front-row/home" onClick={close}>+ Add Course</Link>
          <button className="ghost" type="button" onClick={close}>Cancel</button>
        </div>
      </dialog>
    </>
  );
}
