// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { fakeClient } from "./fakeClient";

const h = vi.hoisted(() => ({ admin: null as unknown, processSegment: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.admin }));
vi.mock("@/lib/lecture", () => ({ processSegment: h.processSegment, finishLecture: vi.fn() }));
vi.mock("@/lib/companion/search", () => ({ indexFiles: vi.fn() }));

import { createLecture, deleteLecture, saveSegment } from "./store";

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const WEEK = "d0000000-0000-4000-8000-00000000000d";
const LEC = "e0000000-0000-4000-8000-00000000000e";
const FOREIGN = "e1000000-0000-4000-8000-00000000000e";

const seed = (consent: string | null = null) => ({
  profiles: [{ user_id: ME, recording_consent_at: consent }],
  weeks: [{ id: WEEK, user_id: ME, course_id: "c1", number: 3, topic: "Demand", keywords: ["elasticity"] }],
  lectures: [
    { id: LEC, user_id: ME, week_id: WEEK, course_label: "ECO101", status: "recording", file_id: "f1" },
    { id: FOREIGN, user_id: OTHER, week_id: null, course_label: "MAT135", status: "recording", file_id: null },
  ],
  files: [{ id: "f1", user_id: ME, week_id: WEEK, origin: "lecture", text: "notes" }],
});
const use = (db: ReturnType<typeof fakeClient>) => ((h.admin = db.client), db);

beforeEach(() => {
  h.processSegment.mockReset();
});

test("create without consent returns 409", async () => {
  const db = use(fakeClient(seed()));
  expect(await createLecture(db.client, ME, { courseLabel: "ECO101", source: "phone" })).toEqual({ code: 409, body: { error: "consent" } });
  expect(db.tables.lectures).toHaveLength(2);
});

test("create with consent stamps it and writes the caller's lecture on their week", async () => {
  const db = use(fakeClient(seed()));
  const out = await createLecture(db.client, ME, { courseLabel: "ECO101", weekId: WEEK, source: "phone", consent: true });
  expect(out.code).toBe(200);
  expect(db.tables.profiles[0].recording_consent_at).toBeTruthy();
  expect(db.tables.lectures.find((l) => l.id === out.body.id)).toMatchObject({ user_id: ME, week_id: WEEK, course_id: "c1" });
});

test("create on a week RLS does not show returns 404 and writes nothing", async () => {
  const db = use(fakeClient({ ...seed("2026-10-27"), weeks: [] }));
  expect((await createLecture(db.client, ME, { courseLabel: "x", weekId: WEEK, source: "room" })).code).toBe(404);
  expect(db.tables.lectures).toHaveLength(2);
});

test("a class member creates a lecture on the teacher's week (visible through RLS); it is the member's", async () => {
  const db = use(fakeClient({ ...seed("2026-10-27"), weeks: [{ id: WEEK, user_id: OTHER, course_id: "class" }] }));
  const out = await createLecture(db.client, ME, { courseLabel: "ECO101", weekId: WEEK, source: "room" });
  expect(db.tables.lectures.find((l) => l.id === out.body.id)).toMatchObject({ user_id: ME, week_id: WEEK, course_id: "class" });
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

test("delete removes the lecture's objects, its notes file and the row", async () => {
  const db = use(fakeClient(seed(), [`${ME}/${LEC}/0.wav`, `${ME}/${LEC}/0-10.jpg`, `${ME}/other/0.wav`]));
  expect((await deleteLecture(db.client, ME, LEC)).code).toBe(200);
  expect(db.bucket.remove).toHaveBeenCalledWith([`${ME}/${LEC}/0.wav`, `${ME}/${LEC}/0-10.jpg`]);
  expect([...db.stored]).toEqual([`${ME}/other/0.wav`]);
  expect(db.tables.files).toEqual([]);
  expect(db.tables.lectures.map((l) => l.id)).toEqual([FOREIGN]);
});
