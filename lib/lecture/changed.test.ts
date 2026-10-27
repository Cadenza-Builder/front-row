import { describe, expect, it } from "vitest";
import { changeTracker, imageChanged } from "./changed";

describe("imageChanged", () => {
  it("imageChanged false for identical, true for a frame 20% different", () => {
    const a = new Uint8Array(32 * 18).fill(100);
    const b = a.map((v, i) => (i % 5 === 0 ? 255 : v)); // every fifth pixel flips: mean diff 0.2 × 155/255 ≈ 0.12
    expect(imageChanged(a, a.slice())).toBe(false);
    expect(imageChanged(a, b)).toBe(true);
  });
});

describe("changeTracker", () => {
  it("changeTracker catches slow drift by comparing against the last kept frame", () => {
    // Each frame is 5% (of 255) brighter than the one before: never a change frame to frame.
    const frames = [0, 1, 2, 3, 4].map((i) => new Uint8Array(32 * 18).fill(100 + Math.round(i * 0.05 * 255)));
    expect(imageChanged(frames[0], frames[1])).toBe(false);
    const changed = changeTracker();
    // First is the reference; drift 10% at frame 2 is a change and moves the reference; frame 4 is again 10% past it.
    expect(frames.map(changed)).toEqual([true, false, true, false, true]);
  });
});
