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
const LEC = "e0000000-0000-4000-8000-00000000000e";
const FOREIGN = "e1000000-0000-4000-8000-00000000000e";
const COURSE = "f0000000-0000-4000-8000-00000000000f";
const DONE = { turns: [{ t: 0, text: "Today: elasticity." }], frames: [], snaps: [] };

function setup(lecture: Record<string, unknown> = {}) {
  const db = fakeClient(
    {
      lecture_courses: [{ id: COURSE, user_id: ME, name: "ECO101", keywords: ["elasticity"], meets: null }],
      lectures: [
        { id: LEC, user_id: ME, lecture_course_id: COURSE, number: 1, week_id: null, status: "recording", file_id: null, ...lecture },
        { id: FOREIGN, user_id: OTHER, lecture_course_id: "theirs", number: 1, week_id: null, status: "recording", file_id: null },
      ],
      lecture_segments: [
        { lecture_id: LEC, user_id: ME, n: 0, status: "done", result: DONE },
        { lecture_id: LEC, user_id: ME, n: 1, status: "uploaded", result: { frames: [{ t: 130, changed: true }] } },
      ],
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
  vi.stubEnv("FRONT_ROW_PUBLIC", "1");
  h.processSegment.mockResolvedValue(DONE);
  h.finishLecture.mockResolvedValue({ notes: { title: "Price elasticity" }, snaps: [], markdown: "# Notes" });
});

test("finish processes the segment not done, titles the lecture from the notes and drops the audio", async () => {
  const db = setup();
  expect(await (await post(LEC)).json()).toEqual({ status: "ready" });
  expect(h.processSegment).toHaveBeenCalledOnce();
  expect(h.processSegment).toHaveBeenCalledWith(expect.objectContaining({ keywords: ["elasticity"] }));
  expect(h.finishLecture).toHaveBeenCalledWith([DONE, DONE], "ECO101", "", ["elasticity"]);
  expect(db.tables.lectures.find((l) => l.id === LEC)).toMatchObject({ status: "ready", title: "Price elasticity", notes: { title: "Price elasticity" } });
  // The notes go into Cadenza only through Add to Cadenza.
  expect(db.tables.files ?? []).toEqual([]);
  expect([...db.stored]).toEqual([`${ME}/${LEC}/1-130.jpg`]);
});

test("a closed Front Row is a 404 before anything runs", async () => {
  vi.stubEnv("FRONT_ROW_PUBLIC", "");
  const db = setup();
  expect((await post(LEC)).status).toBe(404);
  expect(db.tables.lectures.find((l) => l.id === LEC)?.status).toBe("recording");
  vi.stubEnv("FRONT_ROW_PUBLIC", "1");
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
