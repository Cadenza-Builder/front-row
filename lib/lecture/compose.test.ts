// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./board";
import type { Box } from "./locate";
import { meta } from "./meta";
import { compose, toMarkdown, type Notes } from "./compose";

const board: Box = { x1: 0, y1: 70, x2: 1010, y2: 576, w: 1280, h: 720 };
const snap = (t: number, markdown: string): Snapshot => ({ t, url: `f${t}.jpg`, board, markdown, alt: "board" });
const notes = (snaps: number[]): Notes => ({
  title: "Energy",
  summary: "Mass and energy are the same thing.",
  sections: [{ heading: "Mass-energy", body: "Energy is $E = mc^2$.", snaps, exam: [{ quote: "This will be on the test.", t: 62 }] }],
  words: [{ term: "rest mass", meaning: "mass measured at rest" }],
});

beforeEach(() => {
  process.env.MODEL_API_KEY = "test-key";
  vi.restoreAllMocks();
});

describe("toMarkdown boxes", () => {
  // No raw board readings: on rushed chalk they carry [unreadable], repeats and their own headings (MIT 6.041 lec 10 run,
  // 2026-10-29); the notes and boxes already hold what the board said.
  it("toMarkdown output for notes without boxes", () => {
    expect(toMarkdown(notes([1]))).toBe(
      "# Energy\n\nMass and energy are the same thing.\n\n## Mass-energy\n\nEnergy is $E = mc^2$.\n\n" +
        "Exam: This will be on the test.\n\n## Terms\n\n- **rest mass**: mass measured at rest\n",
    );
  });

  it("toMarkdown writes all four boxes and together", () => {
    const n: Notes = { ...notes([]), together: "It all ties up." };
    n.sections[0].boxes = [
      { kind: "formula", tex: "E = mc^2", symbols: [{ sym: "c", meaning: "speed of light" }] },
      { kind: "example", question: "Solve $2x = 4$.", steps: ["Divide by 2."], answer: "$x = 2$", check: "$2 \\cdot 2 = 4$" },
      { kind: "graph", title: "Residuals", caption: "The spread grows with the fit.", x: "fitted", y: "residual", series: [{ label: "obs", points: [[1, 2]] }] },
      { kind: "mistake", text: "Reading a fan as a curve." },
    ];
    const md = toMarkdown(n);
    expect(md).toContain("$$E = mc^2$$\n\n- $c$: speed of light");
    expect(md).toContain("**Worked example:** Solve $2x = 4$.\n\n1. Divide by 2.\n\n**Answer:** $x = 2$\n\n**Check:** $2 \\cdot 2 = 4$");
    expect(md).toContain("**Graph: Residuals**\n\nThe spread grows with the fit.\n\nA graph of residual against fitted.");
    expect(md).not.toContain("[1,2]");
    expect(md).toContain("**Common mistake:** Reading a fan as a curve.");
    expect(md.indexOf("**Common mistake:**")).toBeLessThan(md.indexOf("Exam:"));
    expect(md.endsWith("## Putting it together\n\nIt all ties up.\n")).toBe(true);
  });

  it("toMarkdown leaves out a missing check and caption", () => {
    const n = notes([]);
    n.sections[0].boxes = [
      { kind: "example", question: "q", steps: ["s"], answer: "a" },
      { kind: "graph", title: "T", x: "x", y: "y", series: [{ label: "s", points: [[1, 2]] }] },
    ];
    const md = toMarkdown(n);
    expect(md).not.toContain("Check");
    expect(md).toContain("**Graph: T**\n\nA graph of y against x.");
  });
});

describe("compose", () => {
  it("compose tells the model to keep pipeline tags out of the prose and to state exam points cleanly", async () => {
    let prompt = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(meta().responses, "create").mockImplementation((async (body: any) => {
      prompt = body.input[0].content[0].text;
      return { output_text: JSON.stringify(notes([])) };
    }) as never);
    await compose({ turns: [], snaps: [], course: "ECO220", keywords: [] });
    expect(prompt).toContain("Never put timestamps, snap numbers, `pointing`");
    expect(prompt).toContain("short clean statement of what is examinable");
    expect(prompt).toContain('Only when a whole section has no speech, say "no speech captured"');
  });

  it("compose with zero turns still returns notes from snapshots", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const create = vi.spyOn(meta().responses, "create").mockImplementation((async (body: any) => {
      expect(body.model).toBe("muse-spark-1.3");
      expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
      const prompt = JSON.stringify(body.input);
      expect(prompt).toContain("$$E = mc^2$$");
      expect(prompt).toContain("no speech captured");
      expect(prompt).not.toContain("Course material");
      return { output_text: JSON.stringify(notes([0])) };
    }) as never);
    const { notes: out } = await compose({ turns: [], snaps: [snap(30, "$$E = mc^2$$")], course: "PHY131", keywords: [] });
    expect(create).toHaveBeenCalledOnce();
    expect(out).toEqual(notes([0]));
  });

  it("compose reports the model's tokens, for the run's spend", async () => {
    vi.spyOn(meta().responses, "create").mockResolvedValue({ output_text: JSON.stringify(notes([])), usage: { input_tokens: 1200, output_tokens: 340 } } as never);
    const { usage } = await compose({ turns: [], snaps: [], course: "PHY131", keywords: [] });
    expect(usage).toEqual({ "muse-spark-1.3": { in: 1200, out: 340 } });
  });

  it("compose drops out-of-range snap indexes", async () => {
    vi.spyOn(meta().responses, "create").mockResolvedValue({ output_text: JSON.stringify(notes([3, 0, 0.5, -1])) } as never);
    const { notes: out } = await compose({ turns: [], snaps: [snap(30, "$x$")], course: "PHY131", keywords: [] });
    expect(out.sections[0].snaps).toEqual([0]);
  });

  it("compose sends the keywords and the misheard-term and [inaudible] rules", async () => {
    let prompt = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(meta().responses, "create").mockImplementation((async (body: any) => {
      prompt = body.input[0].content[0].text;
      return { output_text: JSON.stringify(notes([])) };
    }) as never);
    await compose({ turns: [], snaps: [], course: "ECO220", keywords: ["heteroskedasticity", "OLS"] });
    expect(prompt).toContain("heteroskedasticity, OLS");
    expect(prompt).toContain("misheard");
    expect(prompt).toContain("[inaudible]");
  });

  it("compose asks for boxes and together in a strict-safe schema", async () => {
    let body: { input: { content: { text: string }[] }[]; text: { format: { schema: unknown } } } | undefined;
    vi.spyOn(meta().responses, "create").mockImplementation((async (b: never) => {
      body = b;
      return { output_text: JSON.stringify(notes([])) };
    }) as never);
    await compose({ turns: [], snaps: [], course: "ECO220", keywords: [] });
    const schema = JSON.stringify(body!.text.format.schema);
    // Strict mode: every key required, no oneOf/tuples/length keywords.
    expect(schema).toContain('"required":["heading","body","snaps","exam","boxes"]');
    expect(schema).toMatch(/"required":\["title","summary","sections","words","together"\]/);
    expect(schema).not.toMatch(/oneOf|prefixItems|minLength|minItems|maxLength/);
    expect(schema).toContain('"required":["kind","question","steps","answer","check"]');
    expect(schema).toContain('"required":["kind","title","caption","x","y","series"]');
    const prompt = body!.input[0].content[0].text;
    expect(prompt).toContain("Common mistake");
    expect(prompt).toContain("`together`");
    expect(prompt).toContain("`caption`");
    expect(prompt).toContain("`check`");
  });

  it("compose keeps caption and check, and treats null or blank ones as absent without dropping the box", async () => {
    const boxes = [
      { kind: "example", question: "q", steps: ["s"], answer: "a", check: "a works" },
      { kind: "example", question: "q2", steps: ["s"], answer: "a", check: null },
      { kind: "graph", title: "T", caption: "  ", x: "x", y: "y", series: [{ label: "s", points: [[1, 2]] }] },
      { kind: "graph", title: "U", caption: "Rises.", x: "x", y: "y", series: [{ label: "s", points: [[1, 2]] }] },
    ];
    const n = { ...notes([]), sections: [{ ...notes([]).sections[0], boxes }] };
    vi.spyOn(meta().responses, "create").mockResolvedValue({ output_text: JSON.stringify(n) } as never);
    const { notes: out } = await compose({ turns: [], snaps: [], course: "PHY131", keywords: [] });
    const got = out.sections[0].boxes!;
    expect(got).toHaveLength(4);
    expect(got[0]).toMatchObject({ check: "a works" });
    expect(got[1].kind === "example" && got[1].check).toBeUndefined();
    expect(got[2].kind === "graph" && got[2].caption).toBeUndefined();
    expect(got[3]).toMatchObject({ caption: "Rises." });
  });

  it("compose drops malformed boxes and an empty together, never throws", async () => {
    const good = [
      { kind: "formula", tex: "E = mc^2", symbols: [{ sym: "c", meaning: "speed of light" }] },
      { kind: "example", question: "2+2?", steps: ["add"], answer: "4" },
      { kind: "graph", title: "Residuals", x: "fitted", y: "residual", series: [{ label: "obs", points: [[1, 2], [3, -1]] }] },
      { kind: "mistake", text: "Reading a fan as a curve." },
    ];
    const bad = [
      { kind: "table", rows: [] },
      { kind: "mistake", text: "  " },
      { kind: "formula", tex: "", symbols: [] },
      { kind: "example", question: "q", steps: [], answer: "a" },
      { kind: "graph", title: "t", x: "x", y: "y", series: [] },
      { kind: "graph", title: "t", x: "x", y: "y", series: [{ label: "s", points: [] }] },
      { kind: "graph", title: "t", x: "x", y: "y", series: [{ label: "s", points: [[1, 2, 3]] }] },
      { kind: "graph", title: "t", x: "x", y: "y", series: [{ label: "s", points: [[1, "INF"]] }] },
      null,
    ];
    const n = { ...notes([]), together: "" } as Record<string, unknown>;
    n.sections = [{ ...notes([]).sections[0], boxes: [...bad.slice(0, 4), ...good, ...bad.slice(4)] }];
    // 1e999 parses to Infinity: a non-finite point.
    const text = JSON.stringify(n).replace('"INF"', "1e999");
    vi.spyOn(meta().responses, "create").mockResolvedValue({ output_text: text } as never);
    const { notes: out } = await compose({ turns: [], snaps: [], course: "PHY131", keywords: [] });
    expect(out.sections[0].boxes).toEqual(good);
    expect(out).not.toHaveProperty("together");
  });

  it("compose survives null boxes and null together (strict mode unproven on Meta)", async () => {
    const n = { ...notes([]), together: null, sections: [{ ...notes([]).sections[0], boxes: null }] };
    vi.spyOn(meta().responses, "create").mockResolvedValue({ output_text: JSON.stringify(n) } as never);
    const { notes: out } = await compose({ turns: [], snaps: [], course: "PHY131", keywords: [] });
    expect(out.sections[0].heading).toBe("Mass-energy");
    expect(out.sections[0].boxes).toBeUndefined();
    expect(out).not.toHaveProperty("together");
  });

  it("compose keeps a written together", async () => {
    vi.spyOn(meta().responses, "create").mockResolvedValue({ output_text: JSON.stringify({ ...notes([]), together: "It all ties up." }) } as never);
    const { notes: out } = await compose({ turns: [], snaps: [], course: "PHY131", keywords: [] });
    expect(out.together).toBe("It all ties up.");
  });
});
