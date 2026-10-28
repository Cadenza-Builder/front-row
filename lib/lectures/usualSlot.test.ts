import { expect, test } from "vitest";
import { usualSlot } from "./usualSlot";

const TZ = "America/Toronto";
const at = (iso: string) => ({ startedAt: new Date(iso) });

test("two lectures on the same weekday within 30 minutes make a slot", () => {
  // Tue Oct 20 and Tue Oct 27 2026, 10:05 and 10:20 Toronto (UTC-4).
  expect(usualSlot([at("2026-10-20T14:05:00Z"), at("2026-10-27T14:20:00Z")], TZ)).toEqual({ weekday: 2, minutes: 10 * 60 + 20 });
});

test("one lecture is no slot", () => {
  expect(usualSlot([at("2026-10-20T14:05:00Z")], TZ)).toBeNull();
});

test("different weekdays are no slot", () => {
  expect(usualSlot([at("2026-10-20T14:05:00Z"), at("2026-10-22T14:05:00Z")], TZ)).toBeNull();
});

test("same weekday more than 30 minutes apart is no slot", () => {
  expect(usualSlot([at("2026-10-20T14:00:00Z"), at("2026-10-27T14:31:00Z")], TZ)).toBeNull();
});

test("the weekday is the student's, not UTC's", () => {
  // 23:30 Toronto on Monday is Tuesday in UTC.
  expect(usualSlot([at("2026-10-20T03:30:00Z"), at("2026-10-27T03:40:00Z")], TZ)).toEqual({ weekday: 1, minutes: 23 * 60 + 40 });
});
