// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { fakeClient } from "@/lib/lectures/fakeClient";

const h = vi.hoisted(() => ({ db: null as unknown, processSegment: vi.fn(), finishLecture: vi.fn(), indexFiles: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/supabase/server", () => ({ getUser: async () => ({ supabase: h.db, userId: ME }) }));
vi.mock("@/lib/lecture", () => ({ processSegment: h.processSegment, finishLecture: h.finishLecture }));
vi.mock("@/lib/companion/search", () => ({ indexFiles: h.indexFiles }));

import { POST } from "./route";

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const WEEK = "d0000000-0000-4000-8000-00000000000d";
const LEC = "e0000000-0000-4000-8000-00000000000e";
const FOREIGN = "e1000000-0000-4000-8000-00000000000e";
const DONE = { turns: [{ t: 0, text: "Today: elasticity." }], frames: [], snaps: [] };

function setup(lecture: Record<string, unknown> = {}, weekOwner = ME) {
  const db = fakeClient(
    {
      weeks: [{ id: WEEK, user_id: weekOwner, course_id: "c1", number: 3, topic: "Demand", keywords: [] }],
      lectures: [
        { id: LEC, user_id: ME, week_id: WEEK, course_label: "ECO101", status: "recording", file_id: null, ...lecture },
        { id: FOREIGN, user_id: OTHER, week_id: null, course_label: "MAT135", status: "recording", file_id: null },
      ],
      lecture_segments: [
        { lecture_id: LEC, user_id: ME, n: 0, status: "done", result: DONE },
        { lecture_id: LEC, user_id: ME, n: 1, status: "uploaded", result: { frames: [{ t: 130, changed: true }] } },
      ],
      files: [{ id: "slides", user_id: weekOwner, week_id: WEEK, origin: "upload", text: "Elasticity slides" }],
    },
    [`${ME}/${LEC}/0.wav`, `${ME}/${LEC}/1.wav`, `${ME}/${LEC}/1-130.jpg`],
  );
  h.db = db.client;
  return db;
}
const post = (id: string, body: unknown = { segmentCount: 2 }) =>
  POST(new Request(`http://x/api/lectures/${id}/finish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.processSegment.mockResolvedValue(DONE);
  h.finishLecture.mockResolvedValue({ notes: { title: "n" }, snaps: [], markdown: "# Notes" });
});

test("finish processes the segment not done, writes the notes file and drops the audio", async () => {
  const db = setup();
  expect(await (await post(LEC)).json()).toEqual({ status: "ready" });
  expect(h.processSegment).toHaveBeenCalledOnce();
  expect(h.finishLecture).toHaveBeenCalledWith([DONE, DONE], "ECO101", "Elasticity slides");
  const file = db.tables.files.find((f) => f.origin === "lecture");
  expect(file).toMatchObject({ user_id: ME, week_id: WEEK, course_id: "c1", detected_type: "notes", text: "# Notes" });
  expect(h.indexFiles).toHaveBeenCalledOnce();
  expect(db.tables.lectures.find((l) => l.id === LEC)).toMatchObject({ status: "ready", file_id: file?.id });
  expect([...db.stored]).toEqual([`${ME}/${LEC}/1-130.jpg`]);
});

test("finish twice composes once", async () => {
  setup();
  await post(LEC);
  expect(await (await post(LEC)).json()).toEqual({ status: "ready" });
  expect(h.finishLecture).toHaveBeenCalledOnce();
});

test("finish on another student's lecture returns 404", async () => {
  const db = setup();
  expect((await post(FOREIGN)).status).toBe(404);
  expect(db.tables.lectures.find((l) => l.id === FOREIGN)?.status).toBe("recording");
  expect(h.finishLecture).not.toHaveBeenCalled();
});

test("finish failure sets failed and keeps the wavs", async () => {
  const db = setup();
  h.finishLecture.mockRejectedValue(new Error("model down"));
  expect((await (await post(LEC)).json()).status).toBe("failed");
  expect(db.tables.lectures.find((l) => l.id === LEC)).toMatchObject({ status: "failed", error: expect.any(String) });
  expect(db.stored.has(`${ME}/${LEC}/0.wav`)).toBe(true);
  expect(db.tables.files.filter((f) => f.origin === "lecture")).toEqual([]);
});

test("a class member finishes on the teacher's week: the teacher's material is the context, the notes file is the member's", async () => {
  const db = setup({}, OTHER);
  expect(await (await post(LEC)).json()).toEqual({ status: "ready" });
  expect(h.finishLecture).toHaveBeenCalledWith([DONE, DONE], "ECO101", "Elasticity slides");
  expect(db.tables.files.find((f) => f.origin === "lecture")).toMatchObject({ user_id: ME, week_id: WEEK });
});

test("a finish killed mid-way is taken over after 6 minutes, never sooner", async () => {
  setup({ status: "processing", processing_at: new Date(Date.now() - 60_000).toISOString() });
  expect(await (await post(LEC)).json()).toEqual({ status: "processing" });
  expect(h.finishLecture).not.toHaveBeenCalled();
  setup({ status: "processing", processing_at: new Date(Date.now() - 7 * 60_000).toISOString() });
  expect(await (await post(LEC)).json()).toEqual({ status: "ready" });
  expect(h.finishLecture).toHaveBeenCalledOnce();
});

test("a lecture with no words and no boards fails as nothing recorded, without writing notes", async () => {
  const db = setup();
  h.processSegment.mockResolvedValue({ turns: [], frames: [], snaps: [] });
  db.tables.lecture_segments[0].result = { turns: [], frames: [], snaps: [] };
  expect(await (await post(LEC)).json()).toEqual({ status: "failed", error: "Nothing was recorded" });
  expect(h.finishLecture).not.toHaveBeenCalled();
  expect(db.tables.lectures.find((l) => l.id === LEC)).toMatchObject({ status: "failed", error: "Nothing was recorded" });
});
