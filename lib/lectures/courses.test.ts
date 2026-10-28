// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { fakeDb } from "@/lib/canvas/fakeDb";

const h = vi.hoisted(() => ({ create: vi.fn(), admin: null as unknown }));
vi.mock("@/lib/lecture/meta", () => ({ meta: () => ({ responses: { create: h.create } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.admin }));

import { createCourse, listCourses, readSyllabus } from "./courses";

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const ECO = "f0000000-0000-4000-8000-00000000000f";
const STA = "f1000000-0000-4000-8000-00000000000f";
const THEIRS = "fb000000-0000-4000-8000-00000000000f";
const TZ = "America/Toronto";

const seed = () => ({
  lecture_courses: [
    { id: ECO, user_id: ME, name: "ECO220", keywords: ["heteroskedasticity"], meets: null, created_at: "2026-10-01T00:00:00Z" },
    { id: STA, user_id: ME, name: "STA220", keywords: [], meets: [{ weekday: 3, minutes: 600 }], created_at: "2026-10-02T00:00:00Z" },
    { id: THEIRS, user_id: OTHER, name: "MAT135", keywords: [], meets: null, created_at: "2026-10-03T00:00:00Z" },
  ],
  lectures: [
    // Tue 10:05 and Tue 10:20 Toronto: ECO220 is usually Tuesday 10:20.
    { id: "l1", user_id: ME, lecture_course_id: ECO, number: 1, title: "Regression", status: "ready", started_at: "2026-10-20T14:05:00Z", created_at: "2026-10-20T14:05:00Z" },
    { id: "l2", user_id: ME, lecture_course_id: ECO, number: 2, title: "Residuals", status: "ready", started_at: "2026-10-27T14:20:00Z", created_at: "2026-10-27T14:20:00Z" },
    // Abandoned when the phone died: never "Last notes".
    { id: "l4", user_id: ME, lecture_course_id: ECO, number: 3, title: null, status: "recording", started_at: "2026-10-28T09:00:00Z", created_at: "2026-10-28T09:00:00Z" },
    { id: "l3", user_id: OTHER, lecture_course_id: THEIRS, number: 1, title: "x", status: "ready", started_at: "2026-10-28T14:00:00Z", created_at: "2026-10-28T14:00:00Z" },
  ],
});

beforeEach(() => h.create.mockReset());

test("create adds the caller's course by name, as the server (the browser cannot write courses)", async () => {
  const student = fakeDb(seed());
  const admin = fakeDb(seed());
  h.admin = admin.db;
  const out = await createCourse(ME, { name: "  BIO120 " });
  expect(out).toEqual({ code: 201, body: { id: expect.any(String), name: "BIO120" } });
  expect(admin.tables.lecture_courses.at(-1)).toMatchObject({ user_id: ME, name: "BIO120" });
  expect(student.tables.lecture_courses).toHaveLength(3);
  expect((await createCourse(ME, { name: " " })).code).toBe(400);
});

test("the list is the caller's courses, last used first, with the last lecture and the usual slot", async () => {
  const { db } = fakeDb(seed());
  expect(await listCourses(db, ME, TZ)).toEqual({
    code: 200,
    body: {
      courses: [
        { id: ECO, name: "ECO220", keywords: ["heteroskedasticity"], lastLecture: { id: "l2", number: 2, title: "Residuals", createdAt: "2026-10-27T14:20:00Z" }, usual: { weekday: 2, minutes: 620 } },
        // No recordings yet: the syllabus's meeting time stands in.
        { id: STA, name: "STA220", keywords: [], lastLecture: null, usual: { weekday: 3, minutes: 600 } },
      ],
    },
  });
});

const file = (text: string | Uint8Array<ArrayBuffer>, name: string) => new File([text], name);

test("a syllabus fills the course's meeting times and keywords, written as the server", async () => {
  const { db, tables: mine } = fakeDb(seed());
  const { db: admin, tables } = fakeDb(seed());
  h.admin = admin;
  h.create.mockResolvedValue({ output_text: JSON.stringify({ meets: [{ weekday: 2, minutes: 600 }, { weekday: 9, minutes: 5000 }], keywords: [" OLS ", "", "residual"] }) });
  const out = await readSyllabus(db, ME, ECO, file("ECO220. Lectures Tuesdays 10:00. Topics: OLS, residuals.", "syllabus.txt"));
  // Out-of-range times and blank keywords from the model are dropped.
  expect(out).toEqual({ code: 200, body: { meets: [{ weekday: 2, minutes: 600 }], keywords: ["OLS", "residual"] } });
  expect(tables.lecture_courses[0]).toMatchObject({ meets: [{ weekday: 2, minutes: 600 }], keywords: ["OLS", "residual"] });
  expect(mine.lecture_courses[0].keywords).toEqual(["heteroskedasticity"]);
  expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ model: "muse-spark-1.3" }));
  expect(JSON.stringify(h.create.mock.calls[0][0])).toContain("Lectures Tuesdays 10:00");
});

test("a syllabus for another student's course is 404 and reads nothing", async () => {
  const { db, tables } = fakeDb(seed());
  expect((await readSyllabus(db, ME, THEIRS, file("x", "s.txt"))).code).toBe(404);
  expect(h.create).not.toHaveBeenCalled();
  expect(tables.lecture_courses[2].keywords).toEqual([]);
});

test("a photo of a syllabus is refused (only Meta models read Front Row files)", async () => {
  const { db } = fakeDb(seed());
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  expect(await readSyllabus(db, ME, ECO, file(png, "s.png"))).toEqual({ code: 400, body: { error: expect.stringContaining("text") } });
  expect(h.create).not.toHaveBeenCalled();
});
