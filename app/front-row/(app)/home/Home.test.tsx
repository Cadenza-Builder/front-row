import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const { Home, greeting } = await import("./Home");

const eco = { id: "c1", name: "ECO101", keywords: [], icon: "chart", lectureCount: 4, usual: null,
  lastLecture: { id: "l4", number: 4, title: "Price Elasticity", createdAt: "2026-10-28T14:00:00Z" } };
const data = (recent: unknown[]) => ({ courses: [eco], recent }) as never;

beforeEach(() => {
  push.mockClear();
  // jsdom has no <dialog> methods
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

describe("Home", () => {
  it("greets by the hour", () => {
    expect(greeting(5)).toBe("Good morning,");
    expect(greeting(11)).toBe("Good morning,");
    expect(greeting(12)).toBe("Good afternoon,");
    expect(greeting(17)).toBe("Good afternoon,");
    expect(greeting(18)).toBe("Good evening,");
    expect(greeting(2)).toBe("Good evening,");
  });

  it("shows the courses the server gave it at once, with no fetch of its own", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<Home first="Wesley" initials="WM" data={data([])} />);
    expect(screen.getByText("ECO101")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("hides Recent notes when there are none", () => {
    render(<Home first="Wesley" initials="WM" data={data([])} />);
    expect(screen.getByText("4 lectures · Oct 28")).toBeTruthy();
    expect(screen.queryByText("Recent notes")).toBeNull();
  });

  it("shows recent notes with course, number and minutes", () => {
    render(<Home first="Wesley" initials="WM" data={data([{ id: "l4", courseId: "c1", courseName: "ECO101", icon: "chart", number: 4, title: "Price Elasticity", createdAt: "2026-10-28T14:00:00Z", minutes: 52 }])} />);
    expect(screen.getByText("Recent notes")).toBeTruthy();
    expect(screen.getByText("ECO101 · Lecture 4 · Wed, Oct 28")).toBeTruthy();
    expect(screen.getByText("52 min")).toBeTruthy();
  });

  it("Add Course posts the name and the picked icon, then opens the course", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: "c9", name: "PHY131" }) });
    vi.stubGlobal("fetch", fetch);
    render(<Home first="Wesley" initials="WM" data={data([])} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Add Course" })[0]);
    fireEvent.change(screen.getByLabelText("Course name"), { target: { value: "PHY131" } });
    fireEvent.click(screen.getByRole("button", { name: "atom" }));
    expect(screen.getByRole("button", { name: "atom", pressed: true })).toBeTruthy();
    fireEvent.submit(screen.getByLabelText("Course name").closest("form")!);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/front-row/courses/c9"));
    // Home's list came from the server: refreshed, so Back from the new course shows it.
    expect(refresh).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/api/lecture-courses", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "PHY131", icon: "atom" }) }));
  });
  it("with no courses, shows the three steps and Add Course", () => {
    render(<Home first="Wesley" initials="WM" data={{ courses: [], recent: [] }} />);
    expect(screen.getByText("Record the lecture")).toBeTruthy();
    expect(screen.getByText("Add a course")).toBeTruthy();
    expect(screen.getByText("Get the notes")).toBeTruthy();
  });
});
