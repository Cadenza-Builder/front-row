import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Course } from "./Course";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("next/link", () => ({ default: (p: React.ComponentProps<"a">) => <a {...p} /> }));
vi.mock("../../../CourseIcon", () => ({ CourseIcon: ({ icon }: { icon: string }) => <i data-icon={icon} /> }));
// jsdom has no modal dialogs.
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };
afterEach(() => vi.unstubAllGlobals());

const lec = (n: number, status: "ready" | "processing" = "ready") => ({ id: `l${n}`, number: n, title: `Topic ${n}`, status, createdAt: `2026-10-${18 + n}T15:00:00Z`, minutes: 50 });
const course = { id: "c1", name: "ECO101", icon: "chart" as const, nextNumber: 5, lectures: [lec(4), lec(3, "processing"), lec(2), lec(1)] };

test("Record goes to the recorder for this course and names the next lecture", () => {
  render(<Course course={course} saved={null} />);
  const rec = screen.getByRole("link", { name: /Record Lecture 5/ });
  expect(rec.getAttribute("href")).toBe("/front-row/record?course=c1");
});

test("rows link to each lecture; a processing one says Writing notes; the saved one is tagged", () => {
  render(<Course course={course} saved="l4" />);
  expect(screen.getByRole("link", { name: /Topic 3/ }).getAttribute("href")).toBe("/front-row/lectures/l3");
  expect(screen.getByRole("link", { name: /Topic 3/ }).textContent).toContain("Writing notes");
  expect(screen.getByRole("link", { name: /Topic 4/ }).textContent).toContain("Saved");
  expect(screen.getByRole("link", { name: /Topic 2/ }).textContent).not.toContain("Saved");
});

test("delete names every lecture, sends DELETE and goes Home; 409 says a lecture is recording", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 409 }));
  vi.stubGlobal("fetch", fetch);
  render(<Course course={course} saved={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Course options" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete Course" }));
  expect(screen.getByText("Delete ECO101?")).toBeTruthy();
  expect(screen.getByText("Its 4 lectures, their notes and board photos are deleted for good.")).toBeTruthy();
  const go = screen.getByRole("button", { name: "Delete Course" });
  await act(async () => fireEvent.click(go));
  expect(fetch).toHaveBeenCalledWith("/api/lecture-courses/c1", { method: "DELETE" });
  expect(screen.getByText("A lecture is still recording. Stop it first.")).toBeTruthy();
  expect(nav.push).not.toHaveBeenCalled();

  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ deleted: 4 }), { status: 200 }));
  await act(async () => fireEvent.click(go));
  expect(nav.push).toHaveBeenCalledWith("/front-row/home");
});

test("delete of a course already gone (404) goes Home instead of showing an error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Not found" }), { status: 404 })));
  nav.push.mockClear();
  render(<Course course={course} saved={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Course options" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete Course" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete Course" })));
  expect(nav.push).toHaveBeenCalledWith("/front-row/home");
});

test("rename sends the new name and icon, then refreshes", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ course: { id: "c1", name: "ECO102", icon: "sigma" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  render(<Course course={course} saved={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Course options" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename Course" }));
  fireEvent.change(screen.getByLabelText("Course name"), { target: { value: " ECO102 " } });
  fireEvent.click(screen.getByRole("button", { name: "sigma" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
  expect(fetch).toHaveBeenCalledWith("/api/lecture-courses/c1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "ECO102", icon: "sigma" }) }));
  expect(nav.refresh).toHaveBeenCalled();
});
