// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { fakeDb } from "@/lib/canvas/fakeDb";
import { fakeClient } from "@/lib/lectures/fakeClient";

const ME = "00000000-0000-4000-8000-0000000000a1";
const ECO = "f0000000-0000-4000-8000-00000000000f";
const h = vi.hoisted(() => ({ db: null as unknown, userId: null as string | null }));
vi.mock("@/lib/supabase/server", () => ({ getUser: async () => ({ supabase: h.db, userId: h.userId }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));

import { DELETE, PATCH } from "./route";

const patch = (body: unknown, type = "application/json") =>
  PATCH(new Request(`http://x/api/lecture-courses/${ECO}`, { method: "PATCH", headers: { "content-type": type }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: ECO }),
  } as never);

afterEach(() => vi.unstubAllEnvs());

test("PATCH: closed is 404, signed out 401, open renames the caller's course", async () => {
  const { db, tables } = fakeDb({ lecture_courses: [{ id: ECO, user_id: ME, name: "ECO220", icon: "book" }] });
  h.db = db;
  h.userId = ME;
  vi.stubEnv("FRONT_ROW_PUBLIC", "");
  expect((await patch({ name: "ECO221" })).status).toBe(404);
  vi.stubEnv("FRONT_ROW_PUBLIC", "1");
  h.userId = null;
  expect((await patch({ name: "ECO221" })).status).toBe(401);
  expect(tables.lecture_courses[0].name).toBe("ECO220");
  h.userId = ME;
  expect((await patch({ name: "ECO221" }, "text/plain")).status).toBe(415);
  const res = await patch({ name: "ECO221", icon: "atom" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ course: { id: ECO, name: "ECO221", icon: "atom" } });
});

test("DELETE: closed is 404 and deletes nothing, signed out 401, open deletes the caller's course", async () => {
  const { client, tables } = fakeClient({ lecture_courses: [{ id: ECO, user_id: ME, name: "ECO220", icon: "book" }], lectures: [] });
  h.db = client;
  h.userId = ME;
  const del = () => DELETE(new Request(`http://x/api/lecture-courses/${ECO}`, { method: "DELETE" }), { params: Promise.resolve({ id: ECO }) } as never);
  vi.stubEnv("FRONT_ROW_PUBLIC", "");
  expect((await del()).status).toBe(404);
  vi.stubEnv("FRONT_ROW_PUBLIC", "1");
  h.userId = null;
  expect((await del()).status).toBe(401);
  expect(tables.lecture_courses).toHaveLength(1);
  h.userId = ME;
  const res = await del();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ deleted: 0 });
  expect(tables.lecture_courses).toHaveLength(0);
});
