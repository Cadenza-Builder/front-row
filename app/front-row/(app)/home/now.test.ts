import { expect, test } from "vitest";
import { type Course, usuallyNow } from "./now";

const c = (id: string, usual: Course["usual"], createdAt?: string): Course =>
  ({ id, name: id, keywords: [], usual, lastLecture: createdAt ? { id: `${id}-l`, number: 4, title: "Linear Regression", createdAt } : null });

// Tue Oct 27 2026, local time.
const at = (h: number, m: number) => new Date(2026, 9, 27, h, m);

test("a course is usually now on its weekday within 30 minutes of its slot, either side", () => {
  const eco = c("ECO220", { weekday: 2, minutes: 10 * 60 + 10 });
  expect(usuallyNow([eco], at(10, 10))?.id).toBe("ECO220");
  expect(usuallyNow([eco], at(9, 40))?.id).toBe("ECO220");
  expect(usuallyNow([eco], at(10, 40))?.id).toBe("ECO220");
  expect(usuallyNow([eco], at(9, 39))).toBeNull();
  expect(usuallyNow([eco], at(10, 41))).toBeNull();
  expect(usuallyNow([c("MAT133", { weekday: 4, minutes: 10 * 60 + 10 })], at(10, 10))).toBeNull();
  expect(usuallyNow([c("PSY100", null)], at(10, 10))).toBeNull();
});
