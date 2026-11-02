"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { changeTracker } from "@/lib/lecture/changed";
import { createClient } from "@/lib/supabase/browser";
import { type Box, downsample, encodeWav, missingSegments, overlap, pickProfessor, startLecture } from "./media";

type Landmark = { x: number; y: number; visibility?: number };
type Pose = { detect(img: HTMLImageElement): { landmarks: Landmark[][] }; detectForVideo(v: HTMLVideoElement, ms: number): { landmarks: Landmark[][] } };
type Frame = { t: number; changed: boolean };

// MediaPipe from its CDN at a pinned version (as in the mockup), so no new npm dependency: the wasm and model load from there anyway.
const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const SEG = 120; // seconds per segment, as lib/lectures/store.ts expects
const RATE = 16000;
const FRAME_EVERY = 10;
const FULL: Box = { x: 0, y: 0, w: 1, h: 1 }; // no board found yet: the whole frame stands in for it
const MISS_WAIT = 30; // seconds between asks while no board has been found, so a phone facing a wall costs little
const RECHECK = 120; // seconds between asks once found: a small knock to the phone moves the picture less than r.moved notices
const SAMPLE_BOARD: Box = { x: 0, y: 68 / 854, w: 1010 / 1280, h: 508 / 854 }; // SAM 3.1's box on the sample photo (lib/lecture/fixtures/sam-board.txt)
const AMBER = "#f59e0b", BONE = "#f5f2ea";
const ease = (a: Box, b: Box, k: number): Box => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12]];
const seen = (l: Landmark) => (l.visibility ?? 1) > 0.5;

const mmss = (s: number) => `${String((s / 60) | 0).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function Recorder({ course, userId, sample }: { course: string | null; userId: string | null; sample: boolean }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(sample ? "ECO220" : "");
  const [title, setTitle] = useState(sample ? "Linear Regression" : "");
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [consent, setConsent] = useState<((ok: boolean) => void) | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [missing, setMissing] = useState(0);
  const [now] = useState(() => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false }));
  // Everything the frame loop and the audio tap touch lives here, not in state: they run 60 times a second.
  const r = useRef({
    src: null as HTMLVideoElement | HTMLImageElement | null, pose: null as Pose | null, board: null as Box | null, seen: null as Box | null, readAt: -Infinity, askAt: 0, asking: false,
    prof: null as Box | null, shown: null as Box | null, lms: null as Landmark[] | null, lastVideoTime: -1,
    paused: false, stopped: false, t0: 0, pausedFor: 0, pausedAt: 0, reads: 0, nextFrame: 0, tracker: changeTracker(), moved: changeTracker(0.25),
    stream: null as MediaStream | null, ac: null as AudioContext | null, an: null as AnalyserNode | null, wake: null as WakeLockSentinel | null,
    id: "", chunks: [] as Float32Array[], count: 0, n: 0,
    wavs: new Map<number, Blob>(), frames: new Map<number, Promise<Frame | null>[]>(), jobs: new Map<number, Promise<void>>(), uploaded: new Set<number>(),
    raf: 0,
  }).current;
  const $ = (s: string) => root.current!.querySelector(s) as HTMLElement;

  useEffect(() => {
    if (sample || !course) return;
    // The course's name for the HUD; the route may not be there yet, so a miss shows the lecture number only.
    fetch("/api/lecture-courses")
      .then((res) => res.json())
      .then((b: { courses?: { id: string; name: string }[] }) => setName(b.courses?.find((c) => c.id === course)?.name ?? ""))
      .catch(() => {});
  }, [course, sample]);

  const elapsed = () => ((r.paused ? r.pausedAt : performance.now()) - r.t0 - r.pausedFor) / 1000;
  // Lecture time of the audio collected so far: frames are stamped with it so they line up with the WAV offsets.
  const audioTime = () => r.n * SEG + r.count / RATE;
  const srcSize = (): [number, number] =>
    r.src instanceof HTMLVideoElement ? [r.src.videoWidth, r.src.videoHeight] : [r.src!.naturalWidth, r.src!.naturalHeight];
  const toScreen = (fx: number, fy: number): [number, number] => {
    const [sw, sh] = srcSize(), W = innerWidth, H = innerHeight, k = Math.max(W / sw, H / sh);
    return [fx * sw * k + (W - sw * k) / 2, fy * sh * k + (H - sh * k) / 2];
  };
  const crop = (c: CanvasRenderingContext2D, w: number, h: number, b = r.board ?? FULL) => {
    const [sw, sh] = srcSize();
    c.drawImage(r.src!, b.x * sw, b.y * sh, b.w * sw, b.h * sh, 0, 0, w, h);
  };
  /** A 32×18 grey thumbnail of box `b` of the frame, the size changed.ts compares. */
  const grey = (b?: Box) => {
    const tc = Object.assign(document.createElement("canvas"), { width: 32, height: 18 }).getContext("2d", { willReadFrequently: true })!;
    crop(tc, 32, 18, b);
    const d = tc.getImageData(0, 0, 32, 18).data, g = new Uint8Array(32 * 18);
    for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    return g;
  };

  // Uploads segment n: its frames, its WAV, then the segment route. Rejects on failure; the WAV stays for a retry.
  async function send(n: number) {
    const supabase = createClient();
    const frames = (await Promise.all(r.frames.get(n) ?? [])).filter((f) => f !== null);
    const { error: err } = await supabase.storage.from("lectures").upload(`${userId}/${r.id}/${n}.wav`, r.wavs.get(n)!, { upsert: true, contentType: "audio/wav" });
    if (err) throw err;
    const res = await fetch(`/api/lectures/${r.id}/segments/${n}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ frames }) });
    if (!res.ok) throw new Error(`segment ${n}: ${res.status}`);
    r.uploaded.add(n);
    r.wavs.delete(n);
    if (root.current) $("[data-parts]").textContent = String(r.uploaded.size); // may finish after the page is left
  }
  function cut() {
    const pcm = new Float32Array(r.count);
    let o = 0;
    for (const c of r.chunks) {
      pcm.set(c, o);
      o += c.length;
    }
    const n = r.n;
    r.wavs.set(n, encodeWav(pcm, RATE));
    r.chunks = [];
    r.count = 0;
    r.n++;
    // This part, plus any earlier part still waiting, each chained after its last try so a part is never sent twice at once.
    for (const k of r.wavs.keys()) r.jobs.set(k, (r.jobs.get(k) ?? Promise.resolve()).then(() => (r.wavs.has(k) ? send(k) : undefined)).catch((e) => console.warn(e)));
  }
  function startAudio(ac: AudioContext, stream: MediaStream) {
    const source = ac.createMediaStreamSource(stream);
    r.an = ac.createAnalyser();
    r.an.fftSize = 256;
    source.connect(r.an);
    // shortcut: ScriptProcessorNode is deprecated but is the PCM tap every browser (iOS Safari too) runs without a worklet file; move to AudioWorklet if it goes.
    const tap = ac.createScriptProcessor(4096, 1, 1);
    tap.onaudioprocess = (e) => {
      if (r.paused || r.stopped) return;
      const chunk = downsample(e.inputBuffer.getChannelData(0), ac.sampleRate, RATE);
      for (let i = 0; i < chunk.length; ) {
        const take = Math.min(chunk.length - i, SEG * RATE - r.count);
        r.chunks.push(chunk.subarray(i, i + take));
        r.count += take;
        i += take;
        if (r.count === SEG * RATE) cut();
      }
    };
    source.connect(tap);
    tap.connect(ac.destination); // a tap that is not connected never runs; it outputs silence
  }

  // Every 10 s: a board frame, unless the professor covers over 35% of the board. changed.ts decides whether it is a new board.
  function boardFrame() {
    const t = sample ? elapsed() : audioTime();
    if (t < r.nextFrame) return;
    r.nextFrame = Math.floor(t / FRAME_EVERY) * FRAME_EVERY + FRAME_EVERY;
    if (!sample) findBoard(t);
    if (r.prof && overlap(r.prof, r.board ?? FULL) > 0.35) return;
    const changed = r.tracker(grey());
    if (changed) boardRead(t);
    if (sample) return;
    const n = r.n, at = Math.floor(t);
    const [sw, sh] = srcSize(), k = Math.min(1, 1280 / sw), full = document.createElement("canvas");
    full.width = Math.round(sw * k);
    full.height = Math.round(sh * k);
    full.getContext("2d")!.drawImage(r.src!, 0, 0, full.width, full.height);
    const up = new Promise<Blob | null>((res) => full.toBlob(res, "image/jpeg", 0.8)).then(async (jpg) => {
      if (!jpg) return null;
      const { error: err } = await createClient().storage.from("lectures").upload(`${userId}/${r.id}/${n}-${at}.jpg`, jpg, { upsert: true, contentType: "image/jpeg" });
      // A lost frame is a missing board photo, never a failed lecture.
      return err ? null : { t: at, changed };
    });
    r.frames.set(n, [...(r.frames.get(n) ?? []), up]);
  }
  // The live outline: SAM 3.1 through the server at the start, when the picture changes a lot (the phone was moved),
  // every MISS_WAIT s while no board is found and every RECHECK s once one is. One ask at a time; a failed ask keeps the last board.
  function findBoard(t: number) {
    // Checked before r.moved: a move seen while an ask is out must still trigger the next ask.
    if (r.asking || !r.id || r.askAt === Infinity || !srcSize()[0]) return;
    if (!r.moved(grey(FULL)) && t < r.askAt) return;
    r.asking = true;
    r.askAt = t + (r.board ? RECHECK : MISS_WAIT);
    const [sw, sh] = srcSize(), k = Math.min(1, 640 / Math.max(sw, sh)), small = document.createElement("canvas");
    small.width = Math.round(sw * k);
    small.height = Math.round(sh * k);
    small.getContext("2d")!.drawImage(r.src!, 0, 0, small.width, small.height);
    fetch(`/api/lectures/${r.id}/board`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ frame: small.toDataURL("image/jpeg", 0.7) }) })
      .then((res) => {
        if (res.status === 409) r.askAt = Infinity; // the lecture is no longer recording: stop asking
        return res.ok ? res.json() : null;
      })
      .then((out: { board: Box | null } | null) => {
        // No board this time (the professor in front of it, the lights down) keeps the one already found.
        if (out?.board || (out && !r.board)) setBoard(out.board);
      })
      .catch((e) => console.warn("board", e))
      .finally(() => (r.asking = false));
  }
  function setBoard(b: Box | null) {
    if (r.stopped) return; // a reply after Stop or leaving the page
    const moved = !b || !r.board || overlap(b, r.board) < 0.9;
    r.board = b;
    // A new crop is not a new board: the change check starts over from this view of it. The same box (a recheck) keeps
    // its reference, so writing done while the ask was out still counts as new.
    if (moved) {
      r.tracker = changeTracker();
      r.tracker(grey());
    }
    if (!b) r.seen = null;
    $("[data-board]").classList.toggle("on", !!b);
    $("[data-board] b").textContent = b ? "in view" : "finding";
  }
  function boardRead(t: number) {
    r.readAt = performance.now();
    r.reads++;
    $("[data-reads]").textContent = String(r.reads);
    const flash = $(".snap-flash");
    flash.classList.remove("go");
    void flash.offsetWidth;
    flash.classList.add("go");
    crop(($(".toast canvas") as HTMLCanvasElement).getContext("2d")!, 128, 72);
    $("[data-at]").textContent = mmss(t);
    const toast = $(".toast");
    toast.classList.add("on");
    clearTimeout(Number(toast.dataset.t));
    toast.dataset.t = String(window.setTimeout(() => toast.classList.remove("on"), 2200));
  }

  function draw() {
    const ov = $("#ov") as HTMLCanvasElement, ctx = ov.getContext("2d")!, W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
    if (ov.width !== Math.round(W * dpr) || ov.height !== Math.round(H * dpr)) {
      ov.width = Math.round(W * dpr);
      ov.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const box = (x: number, y: number, w: number, h: number, label: string) => {
      ctx.strokeStyle = BONE;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "500 12px Helvetica Neue, Helvetica, Arial";
      const tw = ctx.measureText(label).width + 20, lx = Math.max(x, 0) + 8, ly = Math.max(y, 0) + 8;
      ctx.fillStyle = BONE;
      ctx.beginPath();
      ctx.roundRect(lx, ly, tw, 22, 11);
      ctx.fill();
      ctx.fillStyle = "#05050a";
      ctx.fillText(label, lx + 10, ly + 15);
    };
    // The board (take B · Glow): drawn only once found, easing in from a little wider and following it; a faint amber wash
    // that brightens for 1.5 s when the board is read.
    if (r.board) {
      const b = (r.seen = ease(r.seen ?? { x: r.board.x - 0.03, y: r.board.y - 0.03, w: r.board.w + 0.06, h: r.board.h + 0.06 }, r.board, 0.12));
      const [bx, by] = toScreen(b.x, b.y), [bx2, by2] = toScreen(b.x + b.w, b.y + b.h), lit = Math.max(0, 1 - (performance.now() - r.readAt) / 1500);
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(245,158,11,${0.06 + lit * 0.14})`;
      ctx.strokeStyle = `rgba(245,158,11,${0.55 + lit * 0.45})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, bx2 - bx, by2 - by, 12);
      ctx.fill();
      ctx.stroke();
    }
    if (!r.prof) return;
    const s = (r.shown = r.shown ? ease(r.shown, r.prof, 0.25) : r.prof);
    const [px, py] = toScreen(s.x, s.y), [px2, py2] = toScreen(s.x + s.w, s.y + s.h);
    box(px - 8, py - 8, px2 - px + 16, py2 - py + 16, "Professor");
    const l = r.lms;
    if (!l) return;
    ctx.strokeStyle = "rgba(245,242,234,.85)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const [a, c] of BONES) {
      if (!seen(l[a]) || !seen(l[c])) continue;
      const [x1, y1] = toScreen(l[a].x, l[a].y), [x2, y2] = toScreen(l[c].x, l[c].y);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.fillStyle = AMBER;
    for (const i of [15, 16].filter((i) => seen(l[i]))) {
      const [x, y] = toScreen(l[i].x, l[i].y);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 7);
      ctx.fill();
    }
  }

  function track() {
    const src = r.src!;
    if (!r.pose) return;
    if (src instanceof HTMLVideoElement) {
      if (src.currentTime === r.lastVideoTime) return;
      r.lastVideoTime = src.currentTime;
    } else if (r.lastVideoTime === 0) return; // a still photo: once is enough
    else r.lastVideoTime = 0;
    const out = src instanceof HTMLVideoElement ? r.pose.detectForVideo(src, performance.now()) : r.pose.detect(src);
    const people = out.landmarks.flatMap((l) => {
      const v = l.filter(seen);
      if (!v.length) return [];
      const xs = v.map((p) => p.x), ys = v.map((p) => p.y), x = Math.min(...xs), y = Math.min(...ys);
      return [{ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, l }];
    });
    const p = pickProfessor(people, r.board ?? FULL, r.prof);
    r.prof = p;
    r.lms = p?.l ?? null;
    $("[data-prof]").classList.toggle("on", !!p);
    $("[data-prof] b").textContent = p ? "tracking" : "finding";
  }

  function meter() {
    if (!r.an) return;
    const buf = new Uint8Array(r.an.frequencyBinCount);
    r.an.getByteTimeDomainData(buf);
    let m = 0;
    for (const v of buf) m = Math.max(m, Math.abs(v - 128));
    const lv = Math.min(1, m / 40);
    root.current!.querySelectorAll<HTMLElement>(".lvl i").forEach((b, i) => b.style.setProperty("--v", String(Math.max(0, Math.min(1, lv * 5 - i)))));
  }

  function loop() {
    if (r.stopped) return;
    track();
    if (!r.paused) {
      boardFrame();
      $("[data-clock]").textContent = mmss(elapsed());
    }
    meter();
    draw();
    r.raf = requestAnimationFrame(loop);
  }

  async function loadPose(mode: "VIDEO" | "IMAGE") {
    const url = `${VISION}/vision_bundle.mjs`;
    const { FilesetResolver, PoseLandmarker } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);
    const files = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
    const make = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: mode,
        numPoses: 4,
        minPoseDetectionConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
    r.pose = await make("GPU").catch(() => make("CPU"));
  }
  const lock = async () => {
    try {
      r.wake = await navigator.wakeLock?.request("screen");
    } catch {} // no Wake Lock (older iOS): the phone may dim, the recording goes on
  };
  function begin(src: HTMLVideoElement | HTMLImageElement) {
    r.src = src;
    r.t0 = performance.now();
    setStarted(true);
    r.raf = requestAnimationFrame(loop);
  }

  async function startCamera() {
    setBusy(true);
    setError(null);
    // Made inside the tap: iOS only lets audio start from a user gesture.
    const ac = new AudioContext();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true });
    } catch {
      ac.close();
      setError("Front Row needs your camera and microphone. Allow both for this site, then try again.");
      return setBusy(false);
    }
    // Held from here so an unmount during the consent dialog or the create call still turns the camera off.
    r.stream = stream;
    r.ac = ac;
    const quit = (msg: string | null) => {
      stream.getTracks().forEach((t) => t.stop());
      ac.close();
      setError(msg);
      setBusy(false);
    };
    try {
      const lecture = await startLecture(course!, () => new Promise<boolean>((res) => setConsent(() => res)));
      if (!lecture) return quit(null);
      r.id = lecture.id;
      if (!sample) setTitle(`Lecture ${lecture.number}`);
    } catch (e) {
      return quit(e instanceof Error ? e.message : "Something went wrong. Try again.");
    }
    if (r.stopped) return; // left the page while the lecture was being created
    const video = $("video") as HTMLVideoElement;
    video.srcObject = new MediaStream(stream.getVideoTracks());
    video.hidden = false;
    await video.play().catch(() => {});
    await ac.resume().catch(() => {});
    startAudio(ac, stream);
    lock();
    // No pose model (offline CDN, old GPU) still records; only the Professor box is missing.
    await loadPose("VIDEO").catch((e) => console.warn("pose", e));
    begin(video);
    // iOS can leave the AudioContext stopped: nothing reaches the tap. Say so while there is still a lecture to save.
    setTimeout(() => {
      if (r.stopped || r.paused || r.n || r.count || ask.current?.open) return;
      setError("Sound isn't recording. Tap Keep Recording to turn it on. If this shows again, allow the microphone for this site and start again.");
      ask.current?.showModal();
    }, 5000);
  }

  async function startSample() {
    const still = $("img.still") as HTMLImageElement;
    if (!still.hidden) return; // already starting
    still.hidden = false;
    await still.decode();
    await loadPose("IMAGE").catch((e) => console.warn("pose", e));
    begin(still);
    setTimeout(() => setBoard(SAMPLE_BOARD), 1500); // as the live camera would: found a moment after the start
  }

  function togglePause() {
    const on = !r.paused;
    if (on) r.pausedAt = performance.now();
    else r.pausedFor += performance.now() - r.pausedAt;
    r.paused = on;
    setPaused(on);
  }

  function release() {
    r.stopped = true;
    cancelAnimationFrame(r.raf);
    r.stream?.getTracks().forEach((t) => t.stop());
    r.ac?.close().catch(() => {});
    r.wake?.release().catch(() => {});
  }

  async function upload() {
    setSaving("Saving the last part…");
    await Promise.all(r.jobs.values());
    for (let round = 0; round < 3 && missingSegments([...r.uploaded], r.n).length; round++) {
      await Promise.all(missingSegments([...r.uploaded], r.n).map((n) => send(n).catch((e) => console.warn(e))));
    }
    const left = missingSegments([...r.uploaded], r.n).length;
    setMissing(left);
    setSaving(null);
    if (!left) writeNotes();
  }
  function writeNotes() {
    if (!r.n) return router.push("/front-row/home");
    // Not awaited: finish runs for minutes and the lecture page shows its progress. Same document, so it keeps going.
    fetch(`/api/lectures/${r.id}/finish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ segmentCount: r.n }) }).catch(() => {});
    router.push(`/front-row/lectures/${r.id}`);
  }
  function stopAndWrite() {
    // shortcut: the sample writes nothing, so it ends on Home; point it at a sample lecture once one exists.
    if (sample || !r.id) return (release(), router.push("/front-row/home"));
    if (!r.stopped) {
      r.stopped = true;
      if (r.count) cut();
      release();
      if (!r.n) {
        // Board photos still uploading land first, so the delete takes them; after it the storage lock refuses any straggler.
        void Promise.allSettled([...r.frames.values()].flat()).then(() => fetch(`/api/lectures/${r.id}`, { method: "DELETE" })).catch(() => {});
        return setError("No sound was recorded, so nothing was kept. Allow the microphone for this site, then record again.");
      }
    }
    setError(null);
    upload();
  }

  // Sample: start straight away. Unmount: let go of the camera, mic and wake lock.
  useEffect(() => {
    r.stopped = false; // dev Strict Mode runs this twice, with the cleanup between
    // eslint-disable-next-line react-hooks/set-state-in-effect -- its setState runs after the photo and the pose model load
    if (sample) startSample();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || r.stopped || !r.src) return;
      // iOS drops the wake lock and suspends audio in the background; take both back on return.
      lock();
      r.ac?.resume().catch(() => {});
      if (r.src instanceof HTMLVideoElement) r.src.play().catch(() => {});
    };
    // Audio not yet uploaded (the part being recorded, or a part that failed) lives only in this tab.
    const onLeave = (e: BeforeUnloadEvent) => void ((r.count || r.wavs.size) && e.preventDefault());
    document.addEventListener("visibilitychange", onVisible);
    addEventListener("beforeunload", onLeave);
    return () => {
      // Left in-app (Back): the document lives on, so the part being recorded still uploads.
      if (r.id && !r.stopped && r.count) cut();
      document.removeEventListener("visibilitychange", onVisible);
      removeEventListener("beforeunload", onLeave);
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = useRef<HTMLDialogElement>(null);
  const consentDlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (consent && !consentDlg.current?.open) consentDlg.current?.showModal();
  }, [consent]);
  const answer = (ok: boolean) => {
    consent?.(ok);
    setConsent(null);
    consentDlg.current?.close();
  };
  const [askTime, setAskTime] = useState("00:00");

  return (
    <div className={`s-record${paused ? " is-paused" : ""}`} ref={root}>
      <div className="cam">
        <video playsInline muted autoPlay hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="still" src="/front-row/sample-board.jpg" alt="The sample classroom" hidden />
        <canvas id="ov" />
        <div className="snap-flash" />
        <div className="shade" />
      </div>
      <i className="br" />
      <i className="br" />
      <i className="br" />
      <i className="br" />
      <p className="hud tl">
        <span className="recdot" />
        <b data-clock="">00:00</b> <span className="wide">{[name, title].filter(Boolean).join(" · ")}</span>
      </p>
      <p className="hud tr">
        <span>
          Board read <b data-reads="">0</b>
        </span>
        <span className="wide">
          Parts saved <b data-parts="">0</b>
        </span>
        <span>
          Sound
          <span className="lvl">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      </p>
      <div className="toast glass">
        <canvas width="128" height="72" />
        <div>
          <b>Board read</b> <span data-at="">00:00</span>
        </div>
      </div>
      <div className="state">
        <span data-prof="">
          <i />
          Professor <b>finding</b>
        </span>
        <span data-board="">
          <i />
          Board <b>finding</b>
        </span>
      </div>
      <div className="dock glass">
        <button className={`ctl${paused ? " on" : ""}`} onClick={togglePause} aria-label={paused ? "Resume" : "Pause"} disabled={!started}>
          <svg className="ic" viewBox="0 0 24 24">
            <path className="p" d="M9 6v12M15 6v12" />
            <path className="r" d="M8 5.5v13l11-6.5z" />
          </svg>
          <span>{paused ? "Resume" : "Pause"}</span>
        </button>
        <button
          className="ctl stop"
          aria-label="Stop"
          disabled={!started}
          onClick={() => {
            setAskTime(mmss(elapsed()));
            ask.current?.showModal();
          }}
        >
          <svg className="ic" viewBox="0 0 24 24">
            <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
          </svg>
          <span>Stop</span>
        </button>
      </div>
      <div className="paused" aria-hidden="true">
        <b>Paused</b>
        <span>Nothing is recorded until you resume.</span>
      </div>

      {/* Stop asks first: one stray tap must not end the lecture. The recording keeps running while it is open. */}
      <dialog className="ask glass" aria-labelledby="ask-h" ref={ask} onClick={(e) => e.target === ask.current && !r.stopped && ask.current.close()} onCancel={(e) => r.stopped && e.preventDefault()} onClose={() => setError(null)}>
        <h2 id="ask-h">
          <span className="light">{error ? "No" : "Stop"}</span> <span className="cz-grad">{error ? "sound." : "recording?"}</span>
        </h2>
        {error ? (
          <p>{error}</p>
        ) : missing ? (
          <p>
            <b>{missing}</b> {missing === 1 ? "part has" : "parts have"} not uploaded. Check your connection and try again, or write notes without {missing === 1 ? "it" : "them"}.
          </p>
        ) : (
          <p>
            <b>{askTime}</b> recorded. Front Row writes your notes once you stop. You can&apos;t add to this lecture after.
          </p>
        )}
        <div className="row">
          {missing ? (
            <button className="cz-btn cz-btn--ghost" onClick={upload} disabled={!!saving}>
              Try Again
            </button>
          ) : (
            <button className="cz-btn cz-btn--ghost" autoFocus onClick={() => (r.ac?.resume().catch(() => {}), ask.current?.close())} disabled={r.stopped}>
              Keep Recording
            </button>
          )}
          <button className="cz-btn" onClick={missing ? writeNotes : stopAndWrite} disabled={!!saving}>
            <span className="cz-btn__label">{saving ?? (missing ? "Write Notes Anyway" : error && r.stopped ? "Go Home" : "Stop and Write Notes")}</span>
            <span className="cz-btn__arrow" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </button>
        </div>
      </dialog>

      {/* First recording only (the API answers 409): the recording rule, agreed once. */}
      <dialog className="ask glass" aria-labelledby="consent-h" ref={consentDlg} onCancel={() => answer(false)}>
        <h2 id="consent-h">
          <span className="light">Allowed to</span> <span className="cz-grad">record?</span>
        </h2>
        <p>Record a class only with your professor&apos;s permission or an accommodation. Your recordings are private to you.</p>
        <div className="row">
          <button className="cz-btn cz-btn--ghost" autoFocus onClick={() => answer(false)}>
            Not Now
          </button>
          <button className="cz-btn" onClick={() => answer(true)}>
            <span className="cz-btn__label">I Have Permission</span>
          </button>
        </div>
      </dialog>

      {!started && (
        <div className="start">
          {/* Nothing exists before Start Recording, so leaving loses nothing; once recording, Stop is the way out. */}
          <Link className="back" href="/front-row/home" aria-label="Close"><span className="tile"><svg className="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></span></Link>
          <p className="label">{[name, `Today ${now}`].filter(Boolean).join(" · ")}</p>
          <h1>
            <span className="light">Point at</span> <span className="cz-grad">the board.</span>
          </h1>
          <p>Front Row finds the board and the professor, then records.</p>
          <div className="row">
            <button className="cz-btn" onClick={sample ? startSample : startCamera} disabled={busy}>
              <span className="cz-btn__label">{busy ? "Starting…" : "Start Recording"}</span>
              <span className="cz-btn__arrow" aria-hidden="true">
                ●
              </span>
            </button>
            {sample && (
              <button className="cz-btn cz-btn--ghost" onClick={startSample}>
                Use the Sample Class
              </button>
            )}
          </div>
          {error ? <small className="err">{error}</small> : <small>Uses your camera and microphone.</small>}
        </div>
      )}
    </div>
  );
}
