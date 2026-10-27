import { describe, expect, it } from "vitest";
import { imageChanged } from "./changed";

describe("imageChanged", () => {
  it("imageChanged false for identical, true for a frame 20% different", () => {
    const a = new Uint8Array(32 * 18).fill(100);
    const b = a.map((v, i) => (i % 5 === 0 ? 255 : v)); // every fifth pixel flips: mean diff 0.2 × 155/255 ≈ 0.12
    expect(imageChanged(a, a.slice())).toBe(false);
    expect(imageChanged(a, b)).toBe(true);
  });
});
