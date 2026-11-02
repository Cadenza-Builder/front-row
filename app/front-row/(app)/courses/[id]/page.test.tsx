import { expect, test, vi } from "vitest";
import CoursePage from "./page";

const h = vi.hoisted(() => ({ course: null as unknown, asked: [] as unknown[] }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock("@/lib/supabase/server", () => ({ getUser: async () => ({ supabase: {}, userId: "u1" }) }));
vi.mock("@/lib/lectures/open", () => ({ frontRowOpen: () => true }));
vi.mock("@/lib/lectures/courses", () => ({ getCourse: async (...a: unknown[]) => (h.asked = a, h.course) }));

const OTHER = "00000000-0000-4000-8000-000000000001", MINE = "00000000-0000-4000-8000-000000000002";
const params = (id: string, saved?: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ saved }) });

test("someone else's course (getCourse finds none for this user) is a 404", async () => {
  h.course = null;
  await expect(CoursePage(params(OTHER))).rejects.toThrow("NEXT_NOT_FOUND");
  expect(h.asked.slice(1)).toEqual(["u1", OTHER]);
});

test("the student's own course renders with the saved lecture passed on", async () => {
  h.course = { id: "c1", name: "ECO101", icon: "chart", nextNumber: 1, lectures: [] };
  const out = await CoursePage(params(MINE, "l9"));
  expect(JSON.stringify(out.props)).toContain("l9");
});
