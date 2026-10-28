// @vitest-environment node
import { expect, test, vi } from "vitest";
import { fakeDb } from "@/lib/canvas/fakeDb";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ getUser: async () => ({ supabase: h.db, userId: "00000000-0000-4000-8000-0000000000a1" }) }));

import { POST } from "./route";

const post = () => POST(new Request("http://x/api/lecture-courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "ECO220" }) }));

test("a closed Front Row is a 404 and creates nothing; open, it creates the course", async () => {
  const { db, tables } = fakeDb({ lecture_courses: [] });
  h.db = db;
  vi.stubEnv("FRONT_ROW_PUBLIC", "");
  expect((await post()).status).toBe(404);
  expect(tables.lecture_courses).toEqual([]);
  vi.stubEnv("FRONT_ROW_PUBLIC", "1");
  const res = await post();
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ id: expect.any(String), name: "ECO220" });
  vi.unstubAllEnvs();
});
