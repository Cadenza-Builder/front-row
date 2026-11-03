// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { fakeClient } from "./fakeClient";

const h = vi.hoisted(() => ({ admin: null as unknown, processSegment: vi.fn(), finishLecture: vi.fn(), locate: vi.fn(), later: [] as (() => Promise<unknown>)[] }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<unknown>) => void h.later.push(fn) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.admin }));
vi.mock("@/lib/lecture/pipeline", async (actual) => ({ ...(await actual<object>()), processSegment: h.processSegment, finishLecture: h.finishLecture }));
vi.mock("@/lib/companion/search", () => ({ indexFiles: vi.fn() }));
vi.mock("@/lib/lecture/locate", () => ({ locate: h.locate }));

import { createLecture, deleteLecture, findBoard, finish, linkLecture, renameLecture, saveSegment } from "./store";

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
    { id: LEC, user_id: ME, lecture_course_id: COURSE, number: 2, week_id: null, status: "recording", file_id: "f1", started_at: "2026-10-28T09:00:00Z" },
    { id: FOREIGN, user_id: OTHER, lecture_course_id: THEIRS, number: 1, week_id: null, status: "recording", file_id: null },
  ],
  files: [{ id: "f1", user_id: ME, week_id: WEEK, origin: "lecture", text: "notes" }],
});
const use = (db: ReturnType<typeof fakeClient>) => ((h.admin = db.client), db);

beforeEach(() => {
  h.processSegment.mockReset();
  h.locate.mockReset();
  h.finishLecture.mockReset();
  h.later.length = 0;
  vi.useRealTimers();
});
const runLater = async () => { for (const fn of h.later.splice(0)) await fn(); };

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
  await runLater();
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

test("a segment later than the lecture has been running is refused before any model call", async () => {
  const db = use(fakeClient({ ...seed(), lectures: [{ id: LEC, user_id: ME, lecture_course_id: COURSE, number: 2, status: "recording", started_at: new Date(Date.now() - 5 * 60_000).toISOString() }] }));
  // Five minutes in: segment 2 (4:00-6:00) can be sent, segment 5 (10:00) cannot exist yet.
  expect((await saveSegment(db.client, ME, LEC, "5", { frames: [] })).code).toBe(400);
  expect(h.processSegment).not.toHaveBeenCalled();
  expect(db.tables.lecture_segments ?? []).toEqual([]);
});

test("the segment cut at Stop is stored for finish and not processed in its own request", async () => {
  const db = use(fakeClient(seed(), [`${ME}/${LEC}/1.wav`]));
  expect((await saveSegment(db.client, ME, LEC, "1", { frames: [{ t: 130, changed: true }], last: true })).code).toBe(202);
  expect(h.later).toEqual([]);
  expect(h.processSegment).not.toHaveBeenCalled();
  // Marked, so finish processes it at once instead of waiting for a request that is not processing it.
  expect(db.tables.lecture_segments).toEqual([expect.objectContaining({ lecture_id: LEC, user_id: ME, n: 1, status: "uploaded", result: { frames: [{ t: 130, changed: true }], last: true } })]);
});

test("a segment answers before it is processed: the work runs after the reply", async () => {
  const db = use(fakeClient(seed(), [`${ME}/${LEC}/1.wav`]));
  h.processSegment.mockResolvedValue({ turns: [{ t: 120, text: "hi" }], frames: [], snaps: [] });
  expect((await saveSegment(db.client, ME, LEC, "1", { frames: [] })).code).toBe(202);
  expect(h.processSegment).not.toHaveBeenCalled();
  expect(db.tables.lecture_segments).toEqual([expect.objectContaining({ n: 1, status: "uploaded" })]);
  await runLater();
  expect(db.tables.lecture_segments).toEqual([expect.objectContaining({ n: 1, status: "done" })]);
});

test("a segment whose processing fails after the reply is marked failed", async () => {
  const db = use(fakeClient(seed(), [`${ME}/${LEC}/1.wav`]));
  h.processSegment.mockRejectedValue(new Error("408"));
  vi.spyOn(console, "error").mockImplementationOnce(() => {});
  await saveSegment(db.client, ME, LEC, "1", { frames: [] });
  await runLater();
  expect(db.tables.lecture_segments).toEqual([expect.objectContaining({ n: 1, status: "failed" })]);
});

test("finish saves the draft while processing, and a late draft never overwrites the final notes", async () => {
  const done = { turns: [{ t: 0, text: "hi" }], frames: [], snaps: [] };
  const db = use(fakeClient({ ...seed(), lecture_segments: [{ lecture_id: LEC, user_id: ME, n: 0, status: "done", result: done }] }));
  const lec = () => db.tables.lectures.find((l) => l.id === LEC)!;
  const DRAFT = { ...NOTES, title: "Draft" };
  const SNAPS = [{ t: 5, url: "0-5.jpg", board: [], alt: "board" }];
  let onDraft: (n: unknown, s: unknown) => Promise<void> = async () => {};
  h.finishLecture.mockImplementation(async (_s: unknown, _c: unknown, _k: unknown, draft: typeof onDraft) => {
    onDraft = draft;
    await draft(DRAFT, SNAPS);
    expect(lec()).toMatchObject({ status: "processing", notes: DRAFT, snaps: SNAPS });
    return { notes: NOTES, snaps: [], markdown: "", usage: {} };
  });
  expect((await finish(db.client, ME, LEC, { segmentCount: 1 })).body).toEqual({ status: "ready" });
  expect(h.finishLecture).toHaveBeenCalledWith([done], "ECO101", ["elasticity"], expect.any(Function), expect.any(Number));
  await onDraft(DRAFT, SNAPS);
  expect(lec()).toMatchObject({ status: "ready", notes: NOTES });
});

test("Retry of a failed lecture drops the failed run's draft before the new run writes", async () => {
  const done = { turns: [{ t: 0, text: "hi" }], frames: [], snaps: [] };
  const db = use(fakeClient({ ...seed(), lecture_segments: [{ lecture_id: LEC, user_id: ME, n: 0, status: "done", result: done }] }));
  const lec = () => db.tables.lectures.find((l) => l.id === LEC)!;
  Object.assign(lec(), { status: "failed", notes: { ...NOTES, title: "Old draft" } });
  h.finishLecture.mockImplementation(async () => {
    expect(lec()).toMatchObject({ status: "processing", notes: null });
    return { notes: NOTES, snaps: [], markdown: "", usage: {} };
  });
  expect((await finish(db.client, ME, LEC, { segmentCount: 1 })).body).toEqual({ status: "ready" });
});

const FRAME = { frame: "data:image/jpeg;base64,/9j/AAAA" };
// A lecture started a minute ago: the seed's is days old, past the six-hour ceiling.
const live = () => { const db = fakeClient(seed()); h.admin = db.client; db.tables.lectures[0].started_at = new Date(Date.now() - 60_000).toISOString(); return db; };

test("findBoard returns SAM's board as fractions of the frame", async () => {
  const db = live();
  h.locate.mockResolvedValue({ board: { x1: 64, y1: 36, x2: 576, y2: 288, w: 640, h: 360 }, person: null });
  const out = await findBoard(db.client, ME, LEC, FRAME);
  expect(h.locate).toHaveBeenCalledWith(FRAME.frame);
  expect(out.code).toBe(200);
  const b = out.body.board as Record<string, number>;
  expect([b.x, b.y, b.w, b.h].map((v) => +v.toFixed(3))).toEqual([0.1, 0.1, 0.8, 0.7]);
});

test("findBoard says null when SAM finds no board", async () => {
  const db = live();
  h.locate.mockResolvedValue({ board: null, person: null });
  expect(await findBoard(db.client, ME, LEC, FRAME)).toEqual({ code: 200, body: { board: null } });
});

test("findBoard spends nothing on someone else's lecture, one not recording, or a body that is not a JPEG", async () => {
  const db = live();
  expect((await findBoard(db.client, ME, FOREIGN, FRAME)).code).toBe(404);
  expect((await findBoard(db.client, ME, LEC, { frame: "data:image/png;base64,AAAA" })).code).toBe(400);
  expect((await findBoard(db.client, ME, LEC, { frame: "https://evil.test/x.jpg" })).code).toBe(400);
  db.tables.lectures[0].status = "processing";
  expect((await findBoard(db.client, ME, LEC, FRAME)).code).toBe(409);
  expect(h.locate).not.toHaveBeenCalled();
});

test("findBoard refuses a lecture past the six-hour ceiling, so an unfinished lecture is not a forever SAM tap", async () => {
  const db = use(fakeClient(seed()));
  db.tables.lectures[0].started_at = new Date(Date.now() - 6 * 3600_000 - 60_000).toISOString();
  expect((await findBoard(db.client, ME, LEC, FRAME)).code).toBe(409);
  expect(h.locate).not.toHaveBeenCalled();
});

test("a part finish already did is not marked failed when its own late processing throws", async () => {
  const db = use(fakeClient(seed(), [`${ME}/${LEC}/1.wav`]));
  h.processSegment.mockRejectedValue(new Error("408"));
  vi.spyOn(console, "error").mockImplementationOnce(() => {});
  await saveSegment(db.client, ME, LEC, "1", { frames: [] });
  Object.assign(db.tables.lecture_segments[0], { status: "done" });
  await runLater();
  expect(db.tables.lecture_segments).toEqual([expect.objectContaining({ n: 1, status: "done" })]);
});

const SEG0 = { turns: [{ t: 0, text: "hi" }], frames: [], snaps: [] };
const atStop = (row: Record<string, unknown>) => {
  const db = fakeClient({ ...seed(), lecture_segments: [{ lecture_id: LEC, user_id: ME, n: 0, ...row }] }, [`${ME}/${LEC}/0.wav`]);
  h.admin = db.client;
  h.finishLecture.mockImplementation(async (s: unknown) => ({ notes: { ...NOTES, s }, snaps: [], markdown: "", usage: {} }));
  return db;
};

test("finish waits for a segment still processing in its own request and uses its result", async () => {
  vi.useFakeTimers();
  const db = atStop({ status: "uploaded", result: { frames: [] } });
  const out = finish(db.client, ME, LEC, { segmentCount: 1 });
  await vi.advanceTimersByTimeAsync(5_000);
  expect(h.finishLecture).not.toHaveBeenCalled();
  Object.assign(db.tables.lecture_segments[0], { status: "done", result: SEG0 });
  await vi.advanceTimersByTimeAsync(2_000);
  expect((await out).body).toEqual({ status: "ready" });
  expect(h.processSegment).not.toHaveBeenCalled();
  expect(h.finishLecture).toHaveBeenCalledWith([SEG0], "ECO101", ["elasticity"], expect.any(Function), expect.any(Number));
});

test("finish takes over a segment still not done 90 s after it started", async () => {
  vi.useFakeTimers();
  const db = atStop({ status: "uploaded", result: { frames: [] } });
  h.processSegment.mockResolvedValue(SEG0);
  const out = finish(db.client, ME, LEC, { segmentCount: 1 });
  await vi.advanceTimersByTimeAsync(88_000);
  expect(h.processSegment).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(4_000);
  expect((await out).body).toEqual({ status: "ready" });
  expect(h.processSegment).toHaveBeenCalledTimes(1);
});

test("finish processes the segment cut at Stop, and a failed one, straight away", async () => {
  for (const row of [{ status: "uploaded", result: { frames: [], last: true } }, { status: "failed", result: { frames: [] } }]) {
    h.processSegment.mockReset().mockResolvedValue(SEG0);
    const db = atStop(row);
    // Real timers: any wait here would hold the test past its timeout.
    expect((await finish(db.client, ME, LEC, { segmentCount: 1 })).body).toEqual({ status: "ready" });
    expect(h.processSegment).toHaveBeenCalledTimes(1);
  }
});
