import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const push = vi.fn();
const prefetch = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch }) }));
const { RecordLink } = await import("./RecordLink");

const course = (id: string, name: string) => ({ id, name, icon: "chart", lectureCount: 0, lastLecture: null });
const answer = (courses: unknown[]) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ courses, recent: [] }) }));

beforeEach(() => {
  push.mockClear();
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

const tap = () => fireEvent.click(screen.getByRole("link", { name: "Record" }));

it("starts asking for the courses on the finger's touch, and the click uses that same answer", async () => {
  answer([course("c1", "ECO101")]);
  render(<RecordLink className="nav">Record</RecordLink>);
  fireEvent.pointerDown(screen.getByRole("link", { name: "Record" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  tap();
  await waitFor(() => expect(push).toHaveBeenCalledWith("/front-row/record?course=c1"));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("with one course, goes straight to its recorder", async () => {
  answer([course("c1", "ECO101")]);
  render(<RecordLink className="nav">Record</RecordLink>);
  tap();
  await waitFor(() => expect(push).toHaveBeenCalledWith("/front-row/record?course=c1"));
});

it("with no course, goes Home to add one", async () => {
  answer([]);
  render(<RecordLink className="nav">Record</RecordLink>);
  tap();
  await waitFor(() => expect(push).toHaveBeenCalledWith("/front-row/home"));
});

it("with several, asks which course and links each to its recorder", async () => {
  answer([course("c1", "ECO101"), course("c2", "MAT135")]);
  render(<RecordLink className="nav">Record</RecordLink>);
  tap();
  expect(await screen.findByText("Record which course?")).toBeTruthy();
  expect(screen.getByRole("link", { name: /MAT135/ }).getAttribute("href")).toBe("/front-row/record?course=c2");
  expect(push).not.toHaveBeenCalled();
});

it("closes the sheet when + Add Course is tapped (Home may already be open underneath)", async () => {
  answer([course("c1", "ECO101"), course("c2", "MAT135")]);
  render(<RecordLink className="nav">Record</RecordLink>);
  tap();
  await screen.findByText("Record which course?");
  fireEvent.click(screen.getByRole("link", { name: "+ Add Course" }));
  expect((document.querySelector("dialog.fr-pick") as HTMLDialogElement).open).toBe(false);
});
