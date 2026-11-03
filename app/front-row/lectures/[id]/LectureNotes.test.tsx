import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SAMPLE } from "@/app/front-row/sample/lecture";
import { LectureNotes } from "./LectureNotes";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// The lecture's status each poll answers (drafting only).
const h = vi.hoisted(() => ({ status: [] as string[] }));
vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({ from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { status: h.status.shift() ?? "processing" } }) }; return q; } }),
}));
// jsdom has no modal dialogs.
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };

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

test("worked example check and graph caption: shown when present, nothing when absent", () => {
  const c = page();
  expect(c.querySelector(".box.wex p.vfy")!.textContent).toBe("A positive residual means the point sits above the line.");
  expect(c.querySelector(".box.graph figcaption.hint")!.textContent).toContain("The spread grows with the fitted value: a fan.");
  const bare = structuredClone(SAMPLE);
  for (const s of bare.notes!.sections) for (const b of s.boxes ?? []) { delete (b as { check?: string }).check; delete (b as { caption?: string }).caption; }
  const d = render(<LectureNotes lecture={bare} tab="notes" />).container;
  expect(d.querySelector(".box.wex .vfy")).toBeNull();
  expect(d.querySelector(".box.graph figcaption")).toBeNull();
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

// This Lecture (mockups/front-row/manage-c.html): rename and delete from the "…" beside the title.
afterEach(() => vi.unstubAllGlobals());
const saved = { ...SAMPLE, id: "l1" };
// Classes, not ids, across two renders: jsdom answers an id from the whole document.

test("the sheet: title field, what the lecture holds, and the sample never calls the API", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const c = page();
  fireEvent.click(screen.getByRole("button", { name: "Lecture 9: rename or delete" }));
  const sheet = c.querySelector("#lect")!;
  expect(sheet.querySelector(".when")!.textContent).toBe("ECO220 · Lecture 9 · Tue Oct 27");
  expect((sheet.querySelector("input") as HTMLInputElement).value).toBe("Linear Regression");
  expect([...sheet.querySelectorAll(".held li")].map((li) => li.textContent)).toEqual(["Notes3 parts", "Transcript52 min", "Board photos6"]);
  expect(sheet.querySelector("a.cz-btn")!.getAttribute("href")).toBe("/front-row");
  fireEvent.click(screen.getByRole("button", { name: "Delete Lecture" }));
  expect(c.querySelector("#del a.cz-btn--danger")!.getAttribute("href")).toBe("/front-row");
  expect(fetch).not.toHaveBeenCalled();
});

test("delete confirm: the Cadenza copy stays line only when the lecture was added to a week", () => {
  const c = render(<LectureNotes lecture={saved} tab="notes" />).container;
  expect(c.querySelector(".ask li.kept")).toBeNull();
  const d = render(<LectureNotes lecture={{ ...saved, linked: { label: "ECO220 · Week 8", href: "/x" } }} tab="notes" />).container;
  expect(d.querySelector(".ask li.kept")!.textContent).toBe("The copy in ECO220 · Week 8 stays.");
});

test("Save Title renames, Delete for Good deletes and goes home", async () => {
  const fetch = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const c = render(<LectureNotes lecture={saved} tab="notes" />).container;
  fireEvent.click(screen.getByRole("button", { name: "Lecture 9: rename or delete" }));
  fireEvent.change(c.querySelector("#lect input")!, { target: { value: "  Residuals  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save Title" }));
  await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
  expect(fetch).toHaveBeenCalledWith("/api/lectures/l1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "Residuals" }) }));
  fireEvent.click(screen.getByRole("button", { name: "Lecture 9: rename or delete" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete Lecture" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete for Good" }));
  await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/front-row/home"));
  expect(fetch).toHaveBeenLastCalledWith("/api/lectures/l1", { method: "DELETE" });
});

test("a draft: no rename, delete, Save Notes or Add to Cadenza, says it is tidying, and reloads once the final is saved", async () => {
  vi.useFakeTimers();
  h.status = ["processing", "ready"];
  router.refresh.mockClear();
  const c = render(<LectureNotes lecture={{ ...SAMPLE, id: "l1", drafting: true }} tab="notes" />).container;
  expect(screen.queryByRole("button", { name: /rename or delete/ })).toBeNull();
  expect(screen.queryByText(/Add to Cadenza/)).toBeNull();
  expect(screen.queryByText("Save Notes")).toBeNull();
  expect(screen.queryByText(/Download/)).toBeNull();
  expect(c.textContent).toContain("Tidying up");
  await vi.advanceTimersByTimeAsync(3000);
  expect(router.refresh).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(3000);
  expect(router.refresh).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
