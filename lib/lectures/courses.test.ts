// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { fakeDb } from "@/lib/canvas/fakeDb";
import { fakeClient } from "./fakeClient";

const h = vi.hoisted(() => ({ create: vi.fn(), admin: null as unknown }));
vi.mock("@/lib/lecture/meta", () => ({ meta: () => ({ responses: { create: h.create } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.admin }));

import { createCourse, deleteCourse, getCourse, listCourses, readSyllabus, renameCourse } from "./courses";

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const ECO = "f0000000-0000-4000-8000-00000000000f";
const STA = "f1000000-0000-4000-8000-00000000000f";
const THEIRS = "fb000000-0000-4000-8000-00000000000f";
const TZ = "America/Toronto";

const seed = () => ({
  lecture_courses: [
    { id: ECO, user_id: ME, name: "ECO220", icon: "chart", keywords: ["heteroskedasticity"], meets: null, created_at: "2026-10-01T00:00:00Z" },
    { id: STA, user_id: ME, name: "STA220", icon: "sigma", keywords: [], meets: [{ weekday: 3, minutes: 600 }], created_at: "2026-10-02T00:00:00Z" },
    { id: THEIRS, user_id: OTHER, name: "MAT135", icon: "book", keywords: [], meets: null, created_at: "2026-10-03T00:00:00Z" },
  ],
  lectures: [
    // Tue 10:05 and Tue 10:20 Toronto: ECO220 is usually Tuesday 10:20.
    { id: "l1", user_id: ME, lecture_course_id: ECO, number: 1, title: "Regression", status: "ready", duration_s: 3000, started_at: "2026-10-20T14:05:00Z", created_at: "2026-10-20T14:05:00Z" },
    { id: "l2", user_id: ME, lecture_course_id: ECO, number: 2, title: "Residuals", status: "ready", duration_s: null, started_at: "2026-10-27T14:20:00Z", created_at: "2026-10-27T14:20:00Z" },
    // Abandoned when the phone died: never "Last notes".
    { id: "l4", user_id: ME, lecture_course_id: ECO, number: 3, title: null, status: "recording", duration_s: null, started_at: "2026-10-28T09:00:00Z", created_at: "2026-10-28T09:00:00Z" },
    { id: "l3", user_id: OTHER, lecture_course_id: THEIRS, number: 1, title: "x", status: "ready", duration_s: 60, started_at: "2026-10-28T14:00:00Z", created_at: "2026-10-28T14:00:00Z" },
  ],
});

beforeEach(() => h.create.mockReset());

test("create adds the caller's course by name, as the server (the browser cannot write courses)", async () => {
  const student = fakeDb(seed());
  const admin = fakeDb(seed());
  h.admin = admin.db;
  const out = await createCourse(ME, { name: "  BIO120 " });
  expect(out).toEqual({ code: 201, body: { id: expect.any(String), name: "BIO120", icon: "book" } });
  expect(admin.tables.lecture_courses.at(-1)).toMatchObject({ user_id: ME, name: "BIO120", icon: "book" });
  expect(student.tables.lecture_courses).toHaveLength(3);
  expect((await createCourse(ME, { name: " " })).code).toBe(400);
});

test("create keeps a chosen icon and refuses one outside the ten", async () => {
  const admin = fakeDb(seed());
  h.admin = admin.db;
  expect((await createCourse(ME, { name: "BIO120", icon: "flask" })).body).toMatchObject({ icon: "flask" });
  expect(admin.tables.lecture_courses.at(-1)).toMatchObject({ icon: "flask" });
  expect((await createCourse(ME, { name: "BIO120", icon: "skull" })).code).toBe(400);
  expect(admin.tables.lecture_courses).toHaveLength(4);
});

test("the list is the caller's courses, last used first, with the last lecture and the usual slot", async () => {
  const { db } = fakeDb(seed());
  expect(await listCourses(db, ME, TZ)).toEqual({
    code: 200,
    body: {
      courses: [
        // lectureCount counts every lecture, as the course page does (the recording one too).
        { id: ECO, name: "ECO220", keywords: ["heteroskedasticity"], icon: "chart", lectureCount: 3, lastLecture: { id: "l2", number: 2, title: "Residuals", createdAt: "2026-10-27T14:20:00Z" }, usual: { weekday: 2, minutes: 620 } },
        // No recordings yet: the syllabus's meeting time stands in.
        { id: STA, name: "STA220", keywords: [], icon: "sigma", lectureCount: 0, lastLecture: null, usual: { weekday: 3, minutes: 600 } },
      ],
      // Newest ready lectures across the caller's courses; never another student's.
      recent: [
        { id: "l2", courseId: ECO, courseName: "ECO220", icon: "chart", number: 2, title: "Residuals", createdAt: "2026-10-27T14:20:00Z", minutes: null },
        { id: "l1", courseId: ECO, courseName: "ECO220", icon: "chart", number: 1, title: "Regression", createdAt: "2026-10-20T14:05:00Z", minutes: 50 },
      ],
    },
  });
});

test("recent holds the newest four ready lectures", async () => {
  const s = seed();
  const more = [3, 4, 5, 6].map((n) => ({ id: `r${n}`, user_id: ME, lecture_course_id: STA, number: n, title: null, status: "ready", duration_s: 60, started_at: `2026-10-0${n}T10:00:00Z`, created_at: `2026-11-0${n}T15:00:00Z` }));
  const { db } = fakeDb({ ...s, lectures: [...s.lectures, ...more] });
  const out = await listCourses(db, ME, TZ);
  expect((out.body.recent as { id: string }[]).map((r) => r.id)).toEqual(["r6", "r5", "r4", "r3"]);
});

test("getCourse is the caller's course with every lecture, newest first, and the next number", async () => {
  const { db } = fakeDb(seed());
  expect(await getCourse(db, ME, ECO)).toEqual({
    id: ECO,
    name: "ECO220",
    icon: "chart",
    nextNumber: 4,
    lectures: [
      { id: "l4", number: 3, title: null, status: "recording", createdAt: "2026-10-28T09:00:00Z", minutes: null },
      { id: "l2", number: 2, title: "Residuals", status: "ready", createdAt: "2026-10-27T14:20:00Z", minutes: null },
      { id: "l1", number: 1, title: "Regression", status: "ready", createdAt: "2026-10-20T14:05:00Z", minutes: 50 },
    ],
  });
  expect(await getCourse(db, ME, STA)).toMatchObject({ nextNumber: 1, lectures: [] });
  expect(await getCourse(db, ME, THEIRS)).toBeNull();
  expect(await getCourse(db, ME, "not-a-uuid")).toBeNull();
});

test("rename changes the caller's course name and icon, as the server", async () => {
  const { db, tables } = fakeDb(seed());
  h.admin = db;
  expect(await renameCourse(ME, ECO, { name: "  ECO221 ", icon: "globe" })).toEqual({ code: 200, body: { course: { id: ECO, name: "ECO221", icon: "globe" } } });
  expect(await renameCourse(ME, ECO, { icon: "brain" })).toEqual({ code: 200, body: { course: { id: ECO, name: "ECO221", icon: "brain" } } });
  expect(tables.lecture_courses[0]).toMatchObject({ name: "ECO221", icon: "brain" });
});

test("rename refuses an empty or bad body, and another student's course is 404 and untouched", async () => {
  const { db, tables } = fakeDb(seed());
  h.admin = db;
  expect((await renameCourse(ME, ECO, {})).code).toBe(400);
  expect((await renameCourse(ME, ECO, { name: " " })).code).toBe(400);
  expect((await renameCourse(ME, ECO, { icon: "skull" })).code).toBe(400);
  expect((await renameCourse(ME, ECO, { name: "x", user_id: OTHER })).code).toBe(400);
  expect((await renameCourse(ME, THEIRS, { name: "Mine now" })).code).toBe(404);
  expect((await renameCourse(ME, "not-a-uuid", { name: "x" })).code).toBe(404);
  expect(tables.lecture_courses.map((c) => c.name)).toEqual(["ECO220", "STA220", "MAT135"]);
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
  expect(h.create.mock.calls[0][0]).toMatchObject({ model: "muse-spark-1.3" });
  expect(JSON.stringify(h.create.mock.calls[0][0])).toContain("Lectures Tuesdays 10:00");
});

test("a syllabus read gets 100 s and no retry, inside the 120 s route", async () => {
  const { db } = fakeDb(seed());
  h.admin = fakeDb(seed()).db;
  h.create.mockResolvedValue({ output_text: JSON.stringify({ meets: [], keywords: [] }) });
  await readSyllabus(db, ME, ECO, file("ECO220 syllabus", "syllabus.txt"));
  expect(h.create.mock.calls[0][1]).toEqual({ timeout: 100_000, maxRetries: 0 });
});

test("a syllabus run records its tokens, so admin Spend counts Front Row", async () => {
  const RUN = "a0000000-0000-4000-8000-0000000000aa";
  const { db } = fakeDb(seed());
  const { db: admin, tables } = fakeDb({ ...seed(), runs: [{ id: RUN, user_id: ME, kind: "syllabus", status: "running" }] });
  (db as { rpc: unknown }).rpc = async () => ({ data: RUN, error: null });
  h.admin = admin;
  h.create.mockResolvedValue({ output_text: JSON.stringify({ meets: [], keywords: [] }), usage: { input_tokens: 900, output_tokens: 60 } });
  await readSyllabus(db, ME, ECO, file("ECO220 syllabus", "syllabus.txt"));
  expect(tables.runs[0]).toMatchObject({ status: "done", usage: { "muse-spark-1.3": { in: 900, out: 60 } }, tokens: 960 });
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

// Delete: lectures need uuid ids, or deleteLecture's load() treats them as unknown and deletes nothing.
const L1 = "e1000000-0000-4000-8000-000000000001";
const L2 = "e1000000-0000-4000-8000-000000000002";
const L3 = "e1000000-0000-4000-8000-000000000003";
const L4 = "e1000000-0000-4000-8000-000000000004";
const S1 = "e1000000-0000-4000-8000-000000000005";
const lec = (id: string, user_id: string, lecture_course_id: string, number: number, status = "ready") => ({ id, user_id, lecture_course_id, number, title: null, status, duration_s: 60, started_at: "2026-10-20T14:00:00Z", created_at: "2026-10-20T14:00:00Z" });
// ECO holds L1 and L2, both ready: no recording lecture.
const deleteSeed = (extra: ReturnType<typeof lec>[] = []) => ({
  lecture_courses: seed().lecture_courses,
  lectures: [lec(L1, ME, ECO, 1), lec(L2, ME, ECO, 2), lec(S1, ME, STA, 1), lec(L3, OTHER, THEIRS, 1), ...extra],
});
const deleteObjects = [`${ME}/${L1}/a.jpg`, `${ME}/${L2}/a.jpg`, `${ME}/${S1}/a.jpg`, `${OTHER}/${L3}/0.wav`];

test("delete: another student's course is 404 and nothing is touched", async () => {
  const { client, tables, bucket } = fakeClient(deleteSeed(), deleteObjects);
  h.admin = client;
  expect((await deleteCourse(client, ME, THEIRS)).code).toBe(404);
  expect((await deleteCourse(client, ME, "x")).code).toBe(404);
  expect(tables.lecture_courses).toHaveLength(3);
  expect(tables.lectures).toHaveLength(4);
  expect(bucket.remove).not.toHaveBeenCalled();
});

test("delete: a lecture still recording is 409 and nothing is touched", async () => {
  // Started 5 h 50 m ago: inside the six-hour ceiling, so the phone may still be sending.
  const live = { ...lec(L4, ME, ECO, 3, "recording"), started_at: new Date(Date.now() - 350 * 60_000).toISOString() };
  const { client, tables, stored, bucket } = fakeClient(deleteSeed([live]), [...deleteObjects, `${ME}/${L4}/0.wav`]);
  h.admin = client;
  expect(await deleteCourse(client, ME, ECO)).toEqual({ code: 409, body: { error: "A lecture is still recording. Stop it first." } });
  expect(tables.lecture_courses).toHaveLength(3);
  expect(tables.lectures).toHaveLength(5);
  expect(bucket.remove).not.toHaveBeenCalled();
  expect(stored.size).toBe(5);
});

test("delete: a recording abandoned past the six-hour ceiling does not block, and goes with the course", async () => {
  // The phone died and finish never landed: it stays "recording" forever, and the student cannot stop it.
  const stale = { ...lec(L4, ME, ECO, 3, "recording"), started_at: new Date(Date.now() - 361 * 60_000).toISOString() };
  const { client, tables, stored } = fakeClient(deleteSeed([stale]), [...deleteObjects, `${ME}/${L4}/0.wav`]);
  h.admin = client;
  expect(await deleteCourse(client, ME, ECO)).toEqual({ code: 200, body: { deleted: 3 } });
  expect(tables.lectures.map((l) => l.id)).toEqual([S1, L3]);
  expect(tables.lecture_courses.map((c) => c.id)).toEqual([STA, THEIRS]);
  expect(stored.has(`${ME}/${L4}/0.wav`)).toBe(false);
});

test("delete: a storage failure on lecture 2 keeps the course, lecture 1 is gone, 500", async () => {
  const { client, tables, stored, bucket } = fakeClient(deleteSeed(), deleteObjects);
  h.admin = client;
  const remove = bucket.remove.getMockImplementation()!;
  bucket.remove.mockImplementation(async (ps: string[]) => (ps.some((p) => p.startsWith(`${ME}/${L2}/`)) ? { data: null, error: { message: "boom" } } : remove(ps)) as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await deleteCourse(client, ME, ECO)).code).toBe(500);
  const ids = tables.lectures.map((l) => l.id);
  expect(ids).not.toContain(L1);
  expect(ids).toContain(L2);
  expect(tables.lecture_courses.some((c) => c.id === ECO)).toBe(true);
  expect(stored.has(`${ME}/${L1}/a.jpg`)).toBe(false);
  expect(stored.has(`${ME}/${L2}/a.jpg`)).toBe(true);
});

test("delete: removes every lecture's folder and row, then the course", async () => {
  const { client, tables, stored, bucket } = fakeClient(deleteSeed(), deleteObjects);
  h.admin = client;
  expect(await deleteCourse(client, ME, ECO)).toEqual({ code: 200, body: { deleted: 2 } });
  expect(tables.lectures.map((l) => l.id)).toEqual([S1, L3]);
  expect(tables.lecture_courses.map((c) => c.id)).toEqual([STA, THEIRS]);
  expect([...stored]).toEqual([`${ME}/${S1}/a.jpg`, `${OTHER}/${L3}/0.wav`]);
  // A silent skip cannot pass: storage was really asked, and only for the caller's own folders.
  const removed = bucket.remove.mock.calls.flatMap(([ps]) => ps as string[]);
  expect(removed.sort()).toEqual([`${ME}/${L1}/a.jpg`, `${ME}/${L2}/a.jpg`]);
});
