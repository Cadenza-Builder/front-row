import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Wait, type WaitLecture } from "./Wait";

// The lecture row each poll answers, and how many times it was read.
const h = vi.hoisted(() => ({ reads: 0, answer: [] as unknown[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => {
    const chain = (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        not: () => q,
        maybeSingle: async () => (h.reads++, { data: h.answer.shift() ?? null }),
        then: (ok: (v: unknown) => void) => ok({ data: table === "lecture_segments" ? [] : null }),
      };
      return q;
    };
    return { from: chain, storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) } };
  },
}));

const lec = (status: WaitLecture["status"]): WaitLecture => ({
  status,
  segment_count: 1,
  duration_s: 120,
  notes: status === "ready" ? { title: "Elasticity", summary: "S", sections: [], words: [] } : null,
  error: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  h.reads = 0;
  h.answer = [];
});
afterEach(() => vi.useRealTimers());

test("polls every 2 s while processing and stops once the lecture is ready", async () => {
  h.answer = [lec("processing"), lec("ready")];
  render(<Wait id="l1" dir="u/l1" initial={lec("processing")} segments={[]} srcs={{}} />);
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(h.reads).toBe(1);
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(h.reads).toBe(2);
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(h.reads).toBe(2);
});

test("no poll after the page is left", async () => {
  h.answer = [lec("processing"), lec("processing")];
  const { unmount } = render(<Wait id="l1" dir="u/l1" initial={lec("processing")} segments={[]} srcs={{}} />);
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(h.reads).toBe(1);
  unmount();
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(h.reads).toBe(1);
});

test("a ready lecture never polls", async () => {
  render(<Wait id="l1" dir="u/l1" initial={lec("ready")} segments={[]} srcs={{}} />);
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(h.reads).toBe(0);
});

test("a lecture never sent for notes offers Write Notes after a few seconds, with the parts that landed", async () => {
  const fetch = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const segs = [0, 1].map((n) => ({ n, status: "done", result: { snaps: [], turns: [] } })) as Parameters<typeof Wait>[0]["segments"];
  const { queryByRole, getByRole } = render(<Wait id="l1" dir="u/l1" initial={lec("recording")} segments={segs} srcs={{}} />);
  expect(queryByRole("button", { name: "Write Notes" })).toBeNull();
  // The reveal ticks every 250 ms, one render at a time.
  for (let i = 0; i < 30; i++) await act(() => vi.advanceTimersByTimeAsync(250));
  await act(async () => getByRole("button", { name: "Write Notes" }).click());
  expect(fetch).toHaveBeenCalledWith("/api/lectures/l1/finish", expect.objectContaining({ body: JSON.stringify({ segmentCount: 2 }) }));
  vi.unstubAllGlobals();
});

test("a lecture still recording with nothing uploaded says so instead of waiting forever", async () => {
  const { getByRole, queryByRole } = render(<Wait id="l1" dir="u/l1" initial={{ ...lec("recording"), segment_count: 0 }} segments={[]} srcs={{}} />);
  for (let i = 0; i < 30; i++) await act(() => vi.advanceTimersByTimeAsync(250));
  expect(getByRole("alert").textContent).toBe("Nothing from this lecture reached Front Row.");
  expect(queryByRole("button", { name: "Write Notes" })).toBeNull();
});

const draft = { title: "Elasticity", summary: "S", sections: [{ heading: "Demand", body: "Price moves quantity.", exam: [] }], words: [] };
const reveal = async () => { for (let i = 0; i < 40; i++) await act(() => vi.advanceTimersByTimeAsync(300)); };

test("a processing lecture's draft writes in, then opens right away as a draft", async () => {
  h.answer = Array(20).fill({ ...lec("processing"), notes: draft });
  const { getByText, getByRole } = render(<Wait id="l1" dir="u/l1" initial={{ ...lec("processing"), notes: draft }} segments={[]} srcs={{}} />);
  await reveal();
  expect(getByText("1 · Demand")).toBeTruthy();
  expect(getByText("Price moves quantity.")).toBeTruthy();
  expect(getByText("is ready.")).toBeTruthy();
  expect(getByRole("button", { name: /Open Notes/ })).toBeTruthy();
});

test("when the final arrives the doc shows it and offers Open Notes", async () => {
  const final = { ...draft, sections: [{ heading: "Supply", body: "Final text.", exam: [] }] };
  // The draft is on screen (written in) for a while before the final replaces it.
  h.answer = [...Array(6).fill({ ...lec("processing"), notes: draft }), { ...lec("ready"), notes: final }];
  const { getByText, queryByText, getByRole } = render(<Wait id="l1" dir="u/l1" initial={{ ...lec("processing"), notes: draft }} segments={[]} srcs={{}} />);
  for (let i = 0; i < 34; i++) await act(() => vi.advanceTimersByTimeAsync(300));
  expect(getByText("Price moves quantity.")).toBeTruthy();
  await reveal();
  expect(getByText("Final text.")).toBeTruthy();
  expect(queryByText("Price moves quantity.")).toBeNull();
  expect(getByText("are ready.")).toBeTruthy();
  expect(getByRole("button", { name: /Open Notes/ })).toBeTruthy();
});

test("a processing lecture with no notes shows the pipeline, no doc", async () => {
  h.answer = Array(20).fill(lec("processing"));
  const { container, getByText, queryByRole } = render(<Wait id="l1" dir="u/l1" initial={lec("processing")} segments={[]} srcs={{}} />);
  await reveal();
  expect(getByText("Writing your")).toBeTruthy();
  expect(container.querySelector(".fr-wait.writing")).toBeNull();
  expect(container.querySelector(".doc")!.children.length).toBe(0);
  expect(queryByRole("button", { name: /Open Notes/ })).toBeNull();
});
