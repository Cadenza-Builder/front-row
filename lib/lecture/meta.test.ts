// @vitest-environment node
import { expect, it } from "vitest";
import { meta } from "./meta";

it("meta client times out at 45 s with no retries", () => {
  process.env.MODEL_API_KEY = "test-key";
  expect(meta().timeout).toBe(45_000);
  expect(meta().maxRetries).toBe(0);
});
