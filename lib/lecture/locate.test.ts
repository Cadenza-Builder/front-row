// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { meta } from "./meta";
import { locate, parseSam, pickProfessor } from "./locate";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

beforeEach(() => {
  process.env.MODEL_API_KEY = "test-key";
});

describe("parseSam", () => {
  it("parseSam reads boxes from the docs example", () => {
    // Shape of the docs' two-object line; mask payloads stubbed.
    const docs =
      "<0f>0<|box;x1=353;y1=382;x2=453;y2=427;w=537;h=561|><|mask;x=0;y=0;data=46,1,~|>,1<|box;x1=10;y1=20;x2=30;y2=40;w=537;h=561|><|mask;x=0;y=0;data=46,1,~|>";
    const boxes = parseSam(docs);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toEqual({ x1: 353, y1: 382, x2: 453, y2: 427, w: 537, h: 561 });
  });

  it("parseSam returns [] for empty output", () => {
    expect(parseSam("")).toEqual([]);
  });

  it("parseSam reads the Task 0 fixture", () => {
    expect(parseSam(fixture("sam-board.txt")).length).toBeGreaterThanOrEqual(1);
    expect(parseSam(fixture("sam-person.txt"))).toHaveLength(6);
  });
});

describe("pickProfessor", () => {
  it("pickProfessor ignores foreground students", () => {
    const [board] = parseSam(fixture("sam-board.txt"));
    const people = parseSam(fixture("sam-person.txt"));
    expect(pickProfessor(people, board)).toMatchObject({ x1: 658, y1: 241, x2: 973, y2: 675 });
  });

  it("pickProfessor returns null when nobody stands at the board", () => {
    const board = { x1: 0, y1: 0, x2: 100, y2: 100, w: 500, h: 500 };
    expect(pickProfessor([{ x1: 0, y1: 300, x2: 50, y2: 500, w: 500, h: 500 }], board)).toBeNull();
  });
});

describe("locate", () => {
  it("locate asks SAM for the board and people and picks the professor", async () => {
    const outputs: Record<string, string> = {
      "whiteboard, blackboard or projector screen": fixture("sam-board.txt"),
      person: fixture("sam-person.txt"),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const create = vi.spyOn(meta().responses, "create").mockImplementation((async (body: any) => {
      expect(body.model).toBe("sam-3.1");
      const [text, image] = body.input[0].content;
      expect(image).toEqual({ type: "input_image", image_url: "https://x/f.jpg" });
      return { output_text: outputs[text.text] };
    }) as never);
    const { board, person } = await locate("https://x/f.jpg");
    expect(create).toHaveBeenCalledTimes(2);
    expect(board).toMatchObject({ x1: 0, y1: 70, x2: 1010, y2: 576 });
    expect(person).toMatchObject({ x1: 658, y1: 241, x2: 973, y2: 675 });
  });

  it("locate returns nulls when SAM finds nothing", async () => {
    vi.spyOn(meta().responses, "create").mockResolvedValue({ output_text: "" } as never);
    expect(await locate("https://x/f.jpg")).toEqual({ board: null, person: null });
  });
});
