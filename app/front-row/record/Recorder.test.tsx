import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
