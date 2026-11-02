// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const fake = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: fake.rpc }) }));

const { requestAccess } = await import("./request");

beforeEach(() => {
  fake.rpc.mockReset();
  fake.rpc.mockResolvedValue({ data: true, error: null });
});

test.each([undefined, null, {}, { email: 42 }, { email: "" }, { email: "not-an-email" }, { email: "a@b" }, { email: `${"a".repeat(250)}@b.co` }])(
  "%j is refused with 400 and never reaches the database",
  async (body) => {
    expect((await requestAccess(body)).status).toBe(400);
    expect(fake.rpc).not.toHaveBeenCalled();
  },
);

test("a good email is trimmed, lower-cased and stored", async () => {
  expect(await requestAccess({ email: "  Ada.Lovelace@Mail.UTORONTO.ca " })).toEqual({ status: 200 });
  expect(fake.rpc).toHaveBeenCalledWith("request_front_row_access", { p_email: "ada.lovelace@mail.utoronto.ca" });
});

test("the day's cap answers 429", async () => {
  fake.rpc.mockResolvedValue({ data: false, error: null });
  expect((await requestAccess({ email: "ada@school.ca" })).status).toBe(429);
});

test("a database error answers 500", async () => {
  fake.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await requestAccess({ email: "ada@school.ca" })).status).toBe(500);
});
