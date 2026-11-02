// GET /api/lecture-courses, one course (spec, "Contracts the lanes share"). `usual` is Front Row's learned slot:
// weekday 0 = Sunday, minutes after midnight.
export type Course = {
  id: string;
  name: string;
  keywords: string[];
  lastLecture: { id: string; number: number; title: string | null; createdAt: string } | null;
  usual: { weekday: number; minutes: number } | null;
};

/** The course whose learned slot is now: same weekday, start within 30 minutes either side. */
export function usuallyNow(courses: Course[], now: Date): Course | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  return courses.find((c) => c.usual && c.usual.weekday === now.getDay() && Math.abs(c.usual.minutes - mins) <= 30) ?? null;
}
