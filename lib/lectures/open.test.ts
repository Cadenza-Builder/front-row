import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/lib/admin/id", () => ({ ADMIN_USER_ID: "admin" }));
import { frontRowOpen } from "./open";

afterEach(() => vi.unstubAllEnvs());

test("closed when FRONT_ROW_PUBLIC is unset, even for a signed-in student", () => {
  vi.stubEnv("FRONT_ROW_PUBLIC", undefined as unknown as string);
  expect(frontRowOpen()).toBe(false);
  expect(frontRowOpen("student")).toBe(false);
});

test("open for everyone when FRONT_ROW_PUBLIC is 1", () => {
  vi.stubEnv("FRONT_ROW_PUBLIC", "1");
  expect(frontRowOpen()).toBe(true);
});

test("always open for the admin", () => {
  vi.stubEnv("FRONT_ROW_PUBLIC", "");
  expect(frontRowOpen("admin")).toBe(true);
});
