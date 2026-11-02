import type { Icon } from "@/lib/lectures/icons";

// Adds a Front Row course by name (and icon), then its optional syllabus. Shared by the guided tour and Home's Add a course.

/** The new course, or why not; `note` is also set when the course stands but its syllabus did not upload. */
export async function addCourse(name: string, file: File | null, icon?: Icon): Promise<{ course?: { id: string; name: string }; note: string }> {
  const res = await fetch("/api/lecture-courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, icon }) }).catch(() => null);
  const made: { id?: string; name?: string; error?: string } | null = await res?.json().catch(() => null);
  if (!res?.ok || !made?.id) return { note: made?.error ?? "That did not save. Try again in a moment." };
  // The syllabus is optional: the course stands even when reading it fails, and it can be added again later.
  let note = "";
  if (file) {
    const body = new FormData();
    body.append("file", file);
    const up = await fetch(`/api/lecture-courses/${made.id}/syllabus`, { method: "POST", body }).catch(() => null);
    if (!up?.ok) note = "The syllabus did not upload. You can add it later.";
  }
  return { course: { id: made.id, name: made.name ?? name }, note };
}
