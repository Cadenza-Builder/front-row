import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SAMPLE } from "@/app/front-row/sample/lecture";
import { LectureNotes } from "./LectureNotes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({}) }));
// jsdom has no modal dialogs.
HTMLDialogElement.prototype.showModal = function () { this.open = true; };

// The sample lecture carries one of each box (formula, worked example, graph, mistake), an exam flag and the wrap.
const page = () => render(<LectureNotes lecture={SAMPLE} tab="notes" />).container;

test("formula: display maths and its symbol list", () => {
  const box = page().querySelector(".box.fbox")!;
  expect(box.querySelector(".fx .katex")).not.toBeNull();
  expect(box.querySelectorAll("dl.sym dt")).toHaveLength(3);
  expect(box.querySelector("dl.sym dd")!.textContent).toContain("intercept");
});

test("worked example: numbered steps, each step's maths under it, the answer apart", () => {
  const box = page().querySelector(".box.wex")!;
  expect(box.querySelectorAll("ol.steps li")).toHaveLength(2);
  expect(box.querySelectorAll("ol.steps .ml .katex")).toHaveLength(2);
  expect(box.querySelector(".ans")!.textContent).toContain("The residual is");
});

test("graph: titled, one dot per point, a narrow and a wide drawing", () => {
  const box = page().querySelector(".box.graph")!;
  expect(box.querySelector(".graph__t")!.textContent).toBe("Residuals vs fitted values");
  expect(box.querySelectorAll("svg.g-n circle")).toHaveLength(46);
  expect(box.querySelector("svg.g-n")!.getAttribute("viewBox")).toBe("0 0 320 220");
  expect(box.querySelector("svg.g-w")!.getAttribute("viewBox")).toBe("0 0 720 240");
});

test("common mistake", () => {
  expect(page().querySelector(".box.trap")!.textContent).toContain("Reading the fan as a bad line.");
});

test("likely on the exam: the quote and when it was said, opening that board photo", () => {
  const exam = page().querySelector("aside.exam")!;
  expect(exam.querySelector("q")!.textContent).toBe("If you see this picture, the fan, that is on the midterm.");
  fireEvent.click(screen.getByRole("button", { name: "Said at 14:20." }));
  expect(screen.getByText("Board at 14:20")).toBeTruthy();
});

test("putting it together closes the notes", () => {
  const last = [...page().querySelectorAll("section.part")].at(-1)!;
  expect(last.querySelector("h2")!.textContent).toBe("Putting It Together");
  expect(last.querySelector(".hook--sum")!.textContent).toContain("a fan means heteroskedasticity");
});

test("each part has its time and a Source button; no photo on the page until it is opened", () => {
  const c = page();
  expect(c.querySelector("#p0 .part__src")!.textContent).toBe("06:40 to 13:10 · Board · 06:40");
  expect(c.querySelector("main image, main img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Board · 06:40" }));
  expect(screen.getByRole("img", { name: "The regression model y = b0 + b1 x + u." }).getAttribute("viewBox")).toBe("200 90 820 330");
});
