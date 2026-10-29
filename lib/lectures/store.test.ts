// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { fakeClient } from "./fakeClient";

const h = vi.hoisted(() => ({ admin: null as unknown, processSegment: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.admin }));
vi.mock("@/lib/lecture/pipeline", async (actual) => ({ ...(await actual<object>()), processSegment: h.processSegment, finishLecture: vi.fn() }));
vi.mock("@/lib/companion/search", () => ({ indexFiles: vi.fn() }));

import { createLecture, deleteLecture, linkLecture, renameLecture, saveSegment } from "./store";

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const WEEK = "d0000000-0000-4000-8000-00000000000d";
const LEC = "e0000000-0000-4000-8000-00000000000e";
const FOREIGN = "e1000000-0000-4000-8000-00000000000e";
const COURSE = "f0000000-0000-4000-8000-00000000000f";
const THEIRS = "fb000000-0000-4000-8000-00000000000f";
const NOTES = { title: "Elasticity", summary: "S", sections: [{ heading: "Demand", body: "B", snaps: [], exam: [] }], words: [] };

const seed = (consent: string | null = null) => ({
  profiles: [{ user_id: ME, recording_consent_at: consent }],
  weeks: [{ id: WEEK, user_id: ME, course_id: "c1", number: 3, topic: "Demand", keywords: ["week words"] }],
  lecture_courses: [
    { id: COURSE, user_id: ME, name: "ECO101", keywords: ["elasticity"], meets: null },
    { id: THEIRS, user_id: OTHER, name: "MAT135", keywords: [], meets: null },
  ],
  lectures: [
    { id: LEC, user_id: ME, lecture_course_id: COURSE, number: 2, week_id: null, status: "recording", file_id: "f1" },
    { id: FOREIGN, user_id: OTHER, lecture_course_id: THEIRS, number: 1, week_id: null, status: "recording", file_id: null },
  ],
  files: [{ id: "f1", user_id: ME, week_id: WEEK, origin: "lecture", text: "notes" }],
});
const use = (db: ReturnType<typeof fakeClient>) => ((h.admin = db.client), db);

beforeEach(() => {
  h.processSegment.mockReset();
});

test("create without consent returns 409", async () => {
  const db = use(fakeClient(seed()));
  expect(await createLecture(db.client, ME, { lectureCourseId: COURSE, source: "phone" })).toEqual({ code: 409, body: { error: "consent" } });
  expect(db.tables.lectures).toHaveLength(2);
});

test("create with consent stamps it and numbers the lecture after the course's highest", async () => {
  const db = use(fakeClient(seed()));
  const out = await createLecture(db.client, ME, { lectureCourseId: COURSE, source: "phone", consent: true });
  expect(out).toEqual({ code: 201, body: { id: expect.any(String), number: 3 } });
  expect(db.tables.profiles[0].recording_consent_at).toBeTruthy();
  expect(db.tables.lectures.find((l) => l.id === out.body.id)).toMatchObject({ user_id: ME, lecture_course_id: COURSE, number: 3, source: "phone" });
});

test("the first lecture of a course is Lecture 1", async () => {
  const db = use(fakeClient({ ...seed("2026-10-27"), lectures: [] }));
  expect((await createLecture(db.client, ME, { lectureCourseId: COURSE, source: "room" })).body.number).toBe(1);
});

test("create counts against the daily run cap, and a refusal makes no lecture", async () => {
  const db = use(fakeClient(seed("2026-10-27")));
  const rpc = vi.fn(async () => ({ data: null, error: { message: "daily_run_cap" } }));
  (db.client as { rpc: unknown }).rpc = rpc;
  expect(await createLecture(db.client, ME, { lectureCourseId: COURSE, source: "phone" })).toEqual({ code: 429, body: { error: "You have hit today's limit, try again tomorrow." } });
  expect(rpc).toHaveBeenCalledWith("start_run", { p_week_id: null, p_kind: "lecture" });
  expect(db.tables.lectures).toHaveLength(2);
});

test("create on another student's course returns 404 and writes nothing", async () => {
  // fakeDb has no RLS: the user_id filter in the read is what keeps it out, as RLS does in Postgres.
  const db = use(fakeClient(seed("2026-10-27")));
  expect((await createLecture(db.client, ME, { lectureCourseId: THEIRS, source: "room" })).code).toBe(404);
  expect(db.tables.lectures).toHaveLength(2);
});

test("a segment is processed from the caller's folder and saved as done, frame urls as paths", async () => {
  const db = use(fakeClient(seed(), [`${ME}/${LEC}/1.wav`]));
  h.processSegment.mockImplementation(async (i: { frames: { t: number; url: string; changed: boolean }[] }) => ({
    turns: [{ t: 120, text: "hi" }],
    frames: i.frames.map((f) => ({ ...f, board: null, person: null })),
    snaps: [],
  }));
  expect((await saveSegment(db.client, ME, LEC, "1", { frames: [{ t: 130, changed: true }] })).code).toBe(202);
  expect(h.processSegment).toHaveBeenCalledWith(
    expect.objectContaining({ offset: 120, keywords: ["elasticity"], frames: [{ t: 130, changed: true, url: `https://s.test/${ME}/${LEC}/1-130.jpg` }] }),
  );
  expect(db.tables.lecture_segments).toEqual([
    expect.objectContaining({ lecture_id: LEC, user_id: ME, n: 1, status: "done", result: expect.objectContaining({ frames: [expect.objectContaining({ url: "1-130.jpg" })] }) }),
  ]);
});

test("a segment of another student's lecture returns 404 and writes nothing", async () => {
  const db = use(fakeClient(seed()));
  expect((await saveSegment(db.client, ME, FOREIGN, "0", { frames: [] })).code).toBe(404);
  expect(db.tables.lecture_segments ?? []).toEqual([]);
  expect(h.processSegment).not.toHaveBeenCalled();
});

test("delete of another student's lecture returns 404 and removes nothing", async () => {
  const db = use(fakeClient(seed(), [`${OTHER}/${FOREIGN}/0.wav`]));
  expect((await deleteLecture(db.client, ME, FOREIGN)).code).toBe(404);
  expect(db.bucket.remove).not.toHaveBeenCalled();
  expect(db.tables.lectures).toHaveLength(2);
});

test("delete removes the lecture's objects and row as the server (the browser may not); its copy in a Cadenza week stays", async () => {
  const objs = [`${ME}/${LEC}/0.wav`, `${ME}/${LEC}/0-10.jpg`, `${ME}/other/0.wav`];
  const student = fakeClient(seed(), objs);
  const admin = use(fakeClient(seed(), objs));
  expect((await deleteLecture(student.client, ME, LEC)).code).toBe(200);
  expect(student.bucket.remove).not.toHaveBeenCalled();
  expect(admin.bucket.remove).toHaveBeenCalledWith([`${ME}/${LEC}/0.wav`, `${ME}/${LEC}/0-10.jpg`]);
  expect([...admin.stored]).toEqual([`${ME}/other/0.wav`]);
  expect(admin.tables.lectures.map((l) => l.id)).toEqual([FOREIGN]);
  expect(student.tables.lectures).toHaveLength(2);
  // The delete sheet promises "The copy in <week> stays": the Add to Cadenza file is not touched.
  expect(student.tables.files).toHaveLength(1);
  expect(admin.tables.files).toHaveLength(1);
});

test("delete removes a long lecture's files in pages of at most 1000 (a 3-hour lecture has over 1000 photos)", async () => {
  const objs = Array.from({ length: 1001 }, (_, i) => `${ME}/${LEC}/0-${i * 10}.jpg`);
  const admin = use(fakeClient(seed(), objs));
  expect((await deleteLecture(fakeClient(seed(), objs).client, ME, LEC)).code).toBe(200);
  expect(admin.bucket.remove.mock.calls.map(([ps]) => ps.length)).toEqual([1000, 1]);
  expect(admin.stored.size).toBe(0);
});

test("rename sets the title of the caller's lecture only", async () => {
  const db = use(fakeClient(seed()));
  expect((await renameLecture(db.client, ME, LEC, { title: "  Supply shocks " })).code).toBe(200);
  expect(db.tables.lectures.find((l) => l.id === LEC)?.title).toBe("Supply shocks");
  expect((await renameLecture(db.client, ME, FOREIGN, { title: "x" })).code).toBe(404);
  expect((await renameLecture(db.client, ME, LEC, { title: "" })).code).toBe(400);
  expect(db.tables.lectures.find((l) => l.id === FOREIGN)?.title).toBeUndefined();
});

const ready = () => ({
  ...seed(),
  files: [],
  lectures: [
    { id: LEC, user_id: ME, lecture_course_id: COURSE, number: 2, title: "Elasticity", status: "ready", notes: NOTES, snaps: [], file_id: null, week_id: null, course_id: null },
    { id: FOREIGN, user_id: OTHER, lecture_course_id: THEIRS, number: 1, status: "ready", notes: NOTES, snaps: [], file_id: null },
  ],
});

test("Add to Cadenza writes one notes file into the week and is idempotent", async () => {
  const db = use(fakeClient(ready()));
  const first = await linkLecture(db.client, ME, LEC, { weekId: WEEK });
  expect(first).toEqual({ code: 200, body: { fileId: expect.any(String) } });
  expect(db.tables.files).toEqual([
    expect.objectContaining({ id: first.body.fileId, user_id: ME, course_id: "c1", week_id: WEEK, origin: "lecture", detected_type: "notes", text: expect.stringContaining("## Demand") }),
  ]);
  expect(db.tables.lectures.find((l) => l.id === LEC)).toMatchObject({ file_id: first.body.fileId, week_id: WEEK, course_id: "c1" });
  expect(await linkLecture(db.client, ME, LEC, { weekId: WEEK })).toEqual(first);
  expect(db.tables.files).toHaveLength(1);
});

test("Add to Cadenza refuses another student's lecture, a week RLS hides, and notes not ready", async () => {
  const db = use(fakeClient({ ...ready(), weeks: [] }));
  expect((await linkLecture(db.client, ME, FOREIGN, { weekId: WEEK })).code).toBe(404);
  expect((await linkLecture(db.client, ME, LEC, { weekId: WEEK })).code).toBe(404);
  db.tables.lectures[0].status = "processing";
  db.tables.weeks = [{ id: WEEK, user_id: ME, course_id: "c1", number: 3 }];
  expect((await linkLecture(db.client, ME, LEC, { weekId: WEEK })).code).toBe(409);
  expect(db.tables.files).toEqual([]);
});

test("a segment already sent is not processed again, and its saved result stays", async () => {
  const done = { turns: [{ t: 120, text: "hi" }], frames: [], snaps: [] };
  const db = use(fakeClient({ ...seed(), lecture_segments: [{ lecture_id: LEC, user_id: ME, n: 1, status: "done", result: done }] }, [`${ME}/${LEC}/1.wav`]));
  expect((await saveSegment(db.client, ME, LEC, "1", { frames: [{ t: 130, changed: true }] })).code).toBe(202);
  expect(h.processSegment).not.toHaveBeenCalled();
  expect(db.tables.lecture_segments).toEqual([expect.objectContaining({ status: "done", result: done })]);
});
