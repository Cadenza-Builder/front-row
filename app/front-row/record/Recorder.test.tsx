import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ storage: { from: () => ({ upload: async () => ({ error: null }) }) } }) }));
const { Recorder } = await import("./Recorder");

it("starts recording with no board answer at all", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: /Start Recording/ }));
  await waitFor(() => expect(screen.queryByRole("button", { name: /Start Recording|Starting/ })).toBeNull());
  expect((screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(false);
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

it("a board answer with a person shows the Professor box, then it goes back to finding", async () => {
  const person = { x: 0.5, y: 0.3, w: 0.2, h: 0.5 };
  const node = () => ({ connect: vi.fn(), fftSize: 0, frequencyBinCount: 0, getByteTimeDomainData: () => {} });
  vi.stubGlobal("AudioContext", class {
    destination = {};
    createMediaStreamSource = node;
    createAnalyser = node;
    createScriptProcessor = node;
    resume = async () => {};
    close = async () => {};
  });
  vi.stubGlobal("MediaStream", class {});
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => setTimeout(cb, 16));
  // jsdom has no canvas: a 2d context that records fillText and answers the reads the frame loop makes.
  const fillText = vi.fn();
  const ctx = new Proxy({ fillText, measureText: () => ({ width: 0 }), getImageData: () => ({ data: new Uint8ClampedArray(32 * 18 * 4) }) } as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : () => {}),
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,");
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(null));
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { get: () => 1280, configurable: true });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { get: () => 720, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn().mockResolvedValue({ getVideoTracks: () => [], getTracks: () => [] }) }, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const board = { x: 0.1, y: 0.1, w: 0.6, h: 0.5 };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/lectures") return new Response(JSON.stringify({ id: "L1", number: 1 }), { status: 201 });
    if (url === "/api/lectures/L1/board") return new Response(JSON.stringify({ board, person }));
    return new Response(JSON.stringify({ courses: [] }));
  }));

  const { container, unmount } = render(<Recorder course="C1" userId="u1" sample={false} />);
  fireEvent.click(screen.getByRole("button", { name: /Start Recording/ }));
  await waitFor(() => expect(container.querySelector("[data-board] b")!.textContent).toBe("in view"));
  expect(container.querySelector("[data-prof] b")!.textContent).toBe("tracking");
  expect(container.querySelector("[data-prof]")!.classList.contains("on")).toBe(true);
  await waitFor(() => expect(fillText).toHaveBeenCalledWith("Professor", expect.any(Number), expect.any(Number)));
  // A snapshot, not a track: past PROF_FOR the box and the label go.
  vi.spyOn(performance, "now").mockReturnValue(performance.now() + 5000);
  await waitFor(() => expect(container.querySelector("[data-prof] b")!.textContent).toBe("finding"));
  fillText.mockClear();
  await new Promise((res) => setTimeout(res, 50));
  expect(fillText).not.toHaveBeenCalledWith("Professor", expect.any(Number), expect.any(Number));
  unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
