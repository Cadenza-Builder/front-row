// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Box } from "./locate";
import { meta } from "./meta";
import { BoardReading, pickSnapshots, readBoard, type Frame } from "./board";

const board: Box = { x1: 0, y1: 70, x2: 1010, y2: 576, w: 1280, h: 720 };
const frame = (t: number, b: Box | null, changed: boolean): Frame => ({ t, url: `f${t}.jpg`, board: b, person: null, changed });

beforeEach(() => {
  process.env.MODEL_API_KEY = "test-key";
});

describe("pickSnapshots", () => {
  it("pickSnapshots keeps the first board frame and changed ones, skips boardless", () => {
    const frames = [
      frame(0, null, true), // boardless, even though changed
      frame(5, board, false), // first board frame, kept though unchanged
      frame(10, board, false),
      frame(15, board, true),
      frame(20, null, true),
      frame(25, board, true),
    ];
    expect(pickSnapshots(frames).map((f) => f.t)).toEqual([5, 15, 25]);
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

describe("readBoard", () => {
  it("readBoard sends the image and box to Spark and returns a snapshot", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const create = vi.spyOn(meta().responses, "create").mockImplementation((async (body: any) => {
      expect(body.model).toBe("muse-spark-1.3");
      expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
      const [text, image] = body.input[0].content;
      expect(text.text).toContain("x1=0;y1=70;x2=1010;y2=576 (pixels)");
      expect(text.text).toContain("$...$");
      expect(image).toEqual({ type: "input_image", image_url: "f5.jpg" });
      return { output_text: JSON.stringify({ markdown: "$E = mc^2$", alt: "Einstein's equation" }) };
    }) as never);
    const snap = await readBoard(frame(5, board, true) as Frame & { board: Box });
    expect(create).toHaveBeenCalledOnce();
    expect(snap).toEqual({ t: 5, url: "f5.jpg", board, markdown: "$E = mc^2$", alt: "Einstein's equation" });
  });
});
