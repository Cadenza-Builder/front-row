import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ storage: { from: () => ({ upload: async () => ({ error: null }) }) } }) }));
// The pose model never finishes loading: recording must start anyway.
const forVisionTasks = vi.fn(() => new Promise(() => {}));
const createFromOptions = vi.fn();
vi.mock("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs", () => ({ FilesetResolver: { forVisionTasks }, PoseLandmarker: { createFromOptions } }));
const { Recorder } = await import("./Recorder");

it("starts recording before the pose model has loaded, and loads it once", async () => {
  const node = () => ({ connect: vi.fn(), fftSize: 0 });
  vi.stubGlobal("AudioContext", class {
    destination = {};
    createMediaStreamSource = node;
    createAnalyser = node;
    createScriptProcessor = node;
    resume = async () => {};
    close = async () => {};
  });
  vi.stubGlobal("MediaStream", class {});
  vi.stubGlobal("requestAnimationFrame", () => 0);
  const stream = { getVideoTracks: () => [], getTracks: () => [] };
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn().mockResolvedValue(stream) }, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url === "/api/lectures" ? { id: "L1", number: 1 } : { courses: [] }), { status: 201 })));

  render(<Recorder course="C1" userId="u1" sample={false} />);
  await waitFor(() => expect(forVisionTasks).toHaveBeenCalledOnce()); // warmed on mount, before the tap
  fireEvent.click(screen.getByRole("button", { name: /Start Recording/ }));
  await waitFor(() => expect(screen.queryByRole("button", { name: /Start Recording|Starting/ })).toBeNull());
  expect((screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(false);
  expect(forVisionTasks).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

it("a model that lands after the student left is closed, not kept", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ courses: [] }))));
  let land!: (m: unknown) => void;
  forVisionTasks.mockResolvedValueOnce({});
  createFromOptions.mockReturnValueOnce(new Promise((res) => (land = res)));
  const { unmount } = render(<Recorder course="C1" userId="u1" sample={false} />);
  await waitFor(() => expect(createFromOptions).toHaveBeenCalled());
  unmount(); // went Back before the model finished
  const close = vi.fn();
  land({ close, detect: vi.fn(), detectForVideo: vi.fn() });
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  vi.unstubAllGlobals();
});

it("sends last: true only on the segment cut at Stop, then asks for the notes", async () => {
  let tap!: { onaudioprocess: (e: unknown) => void };
  const node = () => ({ connect: vi.fn(), fftSize: 0 });
  vi.stubGlobal("AudioContext", class {
    destination = {};
    sampleRate = 16000;
    createMediaStreamSource = node;
    createAnalyser = node;
    createScriptProcessor = () => (tap = { connect: vi.fn() } as never);
    resume = async () => {};
    close = async () => {};
  });
  vi.stubGlobal("MediaStream", class {});
  vi.stubGlobal("requestAnimationFrame", () => 0);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn().mockResolvedValue({ getVideoTracks: () => [], getTracks: () => [] }) }, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => new Response(JSON.stringify(url === "/api/lectures" ? { id: "L1", number: 1 } : {}), { status: url === "/api/lectures" ? 201 : 202 }));
  vi.stubGlobal("fetch", fetch);

  render(<Recorder course="C1" userId="u1" sample={false} />);
  fireEvent.click(screen.getByRole("button", { name: /Start Recording/ }));
  await waitFor(() => expect(tap).toBeDefined());
  // A full 2-minute segment (cut by the timer) and 100 samples more (cut at Stop).
  tap.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(120 * 16000 + 100) } });
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  fireEvent.click(screen.getByRole("button", { name: /Stop and Write Notes/ }));
  await waitFor(() => expect(fetch.mock.calls.some(([u]) => u === "/api/lectures/L1/finish")).toBe(true));
  const body = (u: string) => JSON.parse(fetch.mock.calls.find(([x]) => x === u)![1]!.body as string);
  expect(body("/api/lectures/L1/segments/0")).toEqual({ frames: [] });
  expect(body("/api/lectures/L1/segments/1")).toEqual({ frames: [], last: true });
  expect(body("/api/lectures/L1/finish")).toEqual({ segmentCount: 2 });
  vi.unstubAllGlobals();
});
