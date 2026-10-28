// @vitest-environment node
import { strFromU8, unzipSync } from "fflate";
import { beforeEach, expect, test, vi } from "vitest";
import { fakeClient } from "@/lib/lectures/fakeClient";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/supabase/server", () => ({ getUser: async () => ({ supabase: h.db, userId: ME }) }));

import { GET } from "./route";

const ME = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const LEC = "e0000000-0000-4000-8000-00000000000e";
const FOREIGN = "e1000000-0000-4000-8000-00000000000e";
const NOTES = { title: "Elasticity", summary: "How demand answers price.", sections: [{ heading: "Own-price elasticity", body: "B", snaps: [], exam: [] }], words: [] };

beforeEach(() => {
  vi.stubEnv("FRONT_ROW_PUBLIC", "1");
  h.db = fakeClient({
    lecture_courses: [{ id: "c", user_id: ME, name: "ECO101", keywords: [] }],
    lectures: [
      { id: LEC, user_id: ME, lecture_course_id: "c", number: 1, title: "Elasticity", status: "ready", notes: NOTES, snaps: [], file_id: null, created_at: "2026-10-27T14:00:00Z" },
      { id: FOREIGN, user_id: OTHER, lecture_course_id: "x", number: 1, status: "ready", notes: NOTES, snaps: [], file_id: null, created_at: "2026-10-27T14:00:00Z" },
    ],
  }).client;
});
const get = (id: string, format: string) => GET(new Request(`http://x/api/lectures/${id}/export?format=${format}`), { params: Promise.resolve({ id }) });

test("export docx returns a .docx with the section headings", async () => {
  const res = await get(LEC, "docx");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toBe('attachment; filename="ECO101 Oct 27 notes.docx"');
  const xml = strFromU8(unzipSync(new Uint8Array(await res.arrayBuffer()))["word/document.xml"]);
  expect(xml).toContain("Own-price elasticity");
});

test("export pdf returns a PDF", async () => {
  const res = await get(LEC, "pdf");
  expect(res.headers.get("content-type")).toBe("application/pdf");
  expect(new TextDecoder().decode((await res.arrayBuffer()).slice(0, 4))).toBe("%PDF");
});

test("export of another student's lecture is 404", async () => {
  expect((await get(FOREIGN, "docx")).status).toBe(404);
});
