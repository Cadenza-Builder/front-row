// @vitest-environment node
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Box } from "./locate";
import { meta } from "./meta";
import { BoardReading, cropRect, dedupeSnaps, pickSnapshots, readBoard, type Frame, type Snapshot } from "./board";

const board: Box = { x1: 0, y1: 70, x2: 1010, y2: 576, w: 1280, h: 720 };
const frame = (t: number, b: Box | null, changed: boolean): Frame => ({ t, url: `f${t}.jpg`, board: b, person: null, changed });

beforeEach(() => {
  process.env.MODEL_API_KEY = "test-key";
});

describe("pickSnapshots", () => {
  it("pickSnapshots keeps the first board frame and settled changed ones, skips boardless", () => {
    const frames = [
      frame(0, null, true), // boardless, even though changed
      frame(5, board, false), // first board frame, kept though unchanged
      frame(10, board, false),
      frame(15, board, true), // next frame also changed: still being written, not read
      frame(20, null, true),
      frame(25, board, true),
    ];
    expect(pickSnapshots(frames).map((f) => f.t)).toEqual([5, 25]);
  });

  it("pickSnapshots reads a changed frame only once the next frame is unchanged", () => {
    const frames = [true, true, true, false, true, false].map((c, i) => frame(i * 10, board, c));
    expect(pickSnapshots(frames, false).map((f) => f.t)).toEqual([20, 40]);
    expect(pickSnapshots(frames, true).map((f) => f.t)).toEqual([0, 20, 40]);
  });

  it("pickSnapshots reads a long run of changed frames every third frame, so an erased board is not lost", () => {
    const frames = [0, 10, 20, 30, 40, 50].map((t) => frame(t, board, true)).concat(frame(60, board, false));
    expect(pickSnapshots(frames, false).map((f) => f.t)).toEqual([20, 50]);
  });

  it("pickSnapshots reads a changed frame that ends the segment", () => {
    expect(pickSnapshots([frame(0, board, false), frame(10, board, true)], false).map((f) => f.t)).toEqual([10]);
  });

  it("pickSnapshots skips frames without a board when looking at the next frame", () => {
    // The next frame is the next in the list, board or not. Run 20-30 settles on 30, which has no board, so 20 is read instead.
    const frames = [frame(0, board, true), frame(10, null, false), frame(20, board, true), frame(30, null, true), frame(40, board, false)];
    expect(pickSnapshots(frames, false).map((f) => f.t)).toEqual([0, 20]);
  });

  it("pickSnapshots reads nothing from a run of changed frames that has no board", () => {
    const frames = [frame(0, board, false), frame(10, null, true), frame(20, null, true), frame(30, board, false)];
    expect(pickSnapshots(frames, false)).toEqual([]);
  });

  it("pickSnapshots does not repeat a first board frame that also changed", () => {
    expect(pickSnapshots([frame(0, board, true), frame(5, board, true)]).map((f) => f.t)).toEqual([0, 5]);
  });
});

describe("BoardReading", () => {
  it("BoardReading rejects alt over 200 chars", () => {
    expect(BoardReading.safeParse({ markdown: "$x$", alt: "a".repeat(200) }).success).toBe(true);
    expect(BoardReading.safeParse({ markdown: "$x$", alt: "a".repeat(201) }).success).toBe(false);
  });
});

describe("cropRect", () => {
  it("cropRect pads by 5% and stays inside the frame", () => {
    // 1010×506 box: 5% is 50.5 / 25.3 px; x1 = 0 clamps at the left edge.
    expect(cropRect(board, 1280, 720)).toEqual({ left: 0, top: 45, width: 1061, height: 556 });
  });

  it("cropRect scales a 1280 box onto a 1920 frame", () => {
    const b: Box = { x1: 640, y1: 0, x2: 1280, y2: 360, w: 1280, h: 720 };
    expect(cropRect(b, 1920, 1080, 0)).toEqual({ left: 960, top: 0, width: 960, height: 540 });
  });

  it("cropRect clamps a box touching the edges", () => {
    const whole: Box = { x1: 0, y1: 0, x2: 1280, y2: 720, w: 1280, h: 720 };
    expect(cropRect(whole, 1920, 1080)).toEqual({ left: 0, top: 0, width: 1920, height: 1080 });
    const corner: Box = { x1: 1200, y1: 650, x2: 1280, y2: 720, w: 1280, h: 720 };
    const r = cropRect(corner, 1921, 1081);
    expect(r.left + r.width).toBeLessThanOrEqual(1921);
    expect(r.top + r.height).toBeLessThanOrEqual(1081);
    expect(r.width).toBeGreaterThan(0);
    expect(Object.values(r).every(Number.isInteger)).toBe(true);
  });
});

describe("readBoard", () => {
  let jpeg = "";
  beforeAll(async () => {
    const buf = await sharp({ create: { width: 64, height: 36, channels: 3, background: "#204020" } }).jpeg().toBuffer();
    jpeg = `data:image/jpeg;base64,${buf.toString("base64")}`;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const jpegFrame = (t: number) => ({ ...frame(t, board, true), url: jpeg }) as Frame & { board: Box };

  it("readBoard sends a cropped data: image and no coordinates", async () => {
    let image = "";
    let text = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(meta().responses, "create").mockImplementation((async (body: any) => {
      text = body.input[0].content[0].text;
      image = body.input[0].content[1].image_url;
      return { output_text: JSON.stringify({ markdown: "$x$", alt: "x" }) };
    }) as never);
    const snap = await readBoard(jpegFrame(5), []);
    expect(image.startsWith("data:image/jpeg;base64,")).toBe(true);
    const sent = await sharp(Buffer.from(image.split(",")[1], "base64")).metadata();
    const want = cropRect(board, 64, 36);
    expect([sent.width, sent.height]).toEqual([want.width, want.height]);
    expect(text).not.toContain("x1=");
    expect(snap.url).toBe(jpeg);
  });

  it("readBoard throws when the frame cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 404 })));
    const create = vi.spyOn(meta().responses, "create");
    await expect(readBoard(frame(5, board, true) as Frame & { board: Box }, [])).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it("readBoard sends the image to Spark and returns a snapshot", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const create = vi.spyOn(meta().responses, "create").mockImplementation((async (body: any) => {
      expect(body.model).toBe("muse-spark-1.3");
      expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
      const [text, image] = body.input[0].content;
      expect(text.text).toContain("$...$");
      expect(image.type).toBe("input_image");
      return { output_text: JSON.stringify({ markdown: "$E = mc^2$", alt: "Einstein's equation" }) };
    }) as never);
    const snap = await readBoard(jpegFrame(5), []);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][1]).toEqual({ maxRetries: 1 });
    expect(snap).toEqual({ t: 5, url: jpeg, board, markdown: "$E = mc^2$", alt: "Einstein's equation" });
  });

  it("readBoard carries the turns near the frame and the [unreadable] rule", async () => {
    let prompt = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(meta().responses, "create").mockImplementation((async (body: any) => {
      prompt = body.input[0].content[0].text;
      return { output_text: JSON.stringify({ markdown: "$x$", alt: "x" }) };
    }) as never);
    const turns = [
      { start: 0, end: 5, text: "FAR-BEFORE" },
      { start: 70, end: 80, text: "sigma squared over n" },
      { start: 100, end: 104, text: "NEAR-AFTER" },
      { start: 200, end: 210, text: "FAR-AFTER" },
    ];
    await readBoard(jpegFrame(90), turns);
    expect(prompt).toContain("sigma squared over n");
    expect(prompt).toContain("NEAR-AFTER");
    expect(prompt).not.toContain("FAR-BEFORE");
    expect(prompt).not.toContain("FAR-AFTER");
    expect(prompt).toContain("[unreadable]");
  });
});

describe("dedupeSnaps", () => {
  const snap = (t: number, markdown: string): Snapshot => ({ t, url: `f${t}.jpg`, board, markdown, alt: "" });
  const A = "Kirchhoff's voltage law: $\\sum V = 0$ around any closed loop, so $V_R + V_L + V_C = V$";

  it("dedupeSnaps drops empty and all-unreadable reads", () => {
    expect(dedupeSnaps([snap(0, ""), snap(10, "[unreadable] [unreadable]")])).toEqual([]);
  });

  it("dedupeSnaps drops a later read that adds nothing", () => {
    const again = "KIRCHHOFF'S  voltage law:\n$\\sum V=0$ around any closed   loop, so $V_R+V_L+V_C=V$";
    expect(dedupeSnaps([snap(10, A), snap(50, again)]).map((s) => s.t)).toEqual([10]);
  });

  it("dedupeSnaps keeps the fuller later read in place of the earlier", () => {
    const fuller = A + "\n$$L\\frac{d^2Q}{dt^2}+R\\frac{dQ}{dt}+\\frac1C Q=V$$";
    expect(dedupeSnaps([snap(10, A), snap(40, fuller)]).map((s) => s.t)).toEqual([40]);
  });

  it("dedupeSnaps keeps two different boards", () => {
    const one = "$$\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2} \\quad\\text{(Gaussian integral)}$$";
    const two = "$$\\hat\\beta = (X^TX)^{-1}X^Ty,\\; \\operatorname{Var}(\\hat\\beta) = \\sigma^2(X^TX)^{-1}$$";
    expect(dedupeSnaps([snap(5, one), snap(15, two)]).map((s) => s.t)).toEqual([5, 15]);
  });

  it("dedupeSnaps keeps a read that adds more than 10 characters", () => {
    expect(dedupeSnaps([snap(10, A), snap(20, A + " and $x^2+y^2=r^2$ here")]).map((s) => s.t)).toEqual([20]);
  });

  it("dedupeSnaps one read is returned unchanged", () => {
    const one = [snap(10, A)];
    expect(dedupeSnaps(one)).toEqual(one);
  });
});
