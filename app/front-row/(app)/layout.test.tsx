import { expect, test, vi } from "vitest";
import Frame from "./layout";

// The frame shows the student's name: it must stop a closed or signed-out visitor itself, not lean on the page beside it.
const h = vi.hoisted(() => ({ open: false, userId: null as string | null }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock("@/lib/lectures/open", () => ({ frontRowOpen: () => h.open }));
vi.mock("@/lib/supabase/server", () => ({ getUser: async () => ({ supabase: {}, userId: h.userId }) }));

test("closed to this visitor: a 404, no frame", async () => {
  Object.assign(h, { open: false, userId: "u1" });
  await expect(Frame({ children: null })).rejects.toThrow("NEXT_NOT_FOUND");
});

test("open but signed out: off to Front Row's sign-in, no frame", async () => {
  Object.assign(h, { open: true, userId: null });
  await expect(Frame({ children: null })).rejects.toThrow("REDIRECT /sign-in?from=front-row");
});
