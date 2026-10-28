import { z } from "zod";
import type { Snapshot } from "./board";
import type { LinkedTurn } from "./link";
import { meta } from "./meta";

const Formula = z.object({ kind: z.literal("formula"), tex: z.string(), symbols: z.array(z.object({ sym: z.string(), meaning: z.string() })) });
const Example = z.object({ kind: z.literal("example"), question: z.string(), steps: z.array(z.string()), answer: z.string() });
const Mistake = z.object({ kind: z.literal("mistake"), text: z.string() });
const graph = <P extends z.ZodType>(point: P) =>
  z.object({ kind: z.literal("graph"), title: z.string(), x: z.string(), y: z.string(), series: z.array(z.object({ label: z.string(), points: z.array(point) })) });
// z.number() refuses Infinity, so a non-finite point fails the parse.
export const NoteBox = z.discriminatedUnion("kind", [Formula, Example, graph(z.tuple([z.number(), z.number()])), Mistake]);
export type NoteBox = z.infer<typeof NoteBox>;

const filled = (...s: string[]) => s.every((x) => x.trim() !== "");
function whole(b: NoteBox): boolean {
  switch (b.kind) {
    case "formula":
      return filled(b.tex, ...b.symbols.flatMap((s) => [s.sym, s.meaning]));
    case "example":
      return b.steps.length > 0 && filled(b.question, b.answer, ...b.steps);
    case "graph":
      return b.series.length > 0 && b.series.every((s) => s.points.length > 0) && filled(b.title, b.x, b.y);
    case "mistake":
      return filled(b.text);
  }
}
/** A malformed box (unknown kind, empty field, bad point, graph with no points) is dropped, never fatal. */
const keepBoxes = (raw: unknown[]): NoteBox[] =>
  raw.flatMap((r) => {
    const b = NoteBox.safeParse(r);
    return b.success && whole(b.data) ? [b.data] : [];
  });

const Section = z.object({
  heading: z.string(),
  body: z.string(),
  // Not .int(): it emits min/max keywords that strict mode may reject; compose drops non-integers.
  snaps: z.array(z.number()),
  // `t` is seconds from lecture start.
  exam: z.array(z.object({ quote: z.string().describe("What is examinable, in a short clean statement"), t: z.number() })),
});
const Words = z.array(z.object({ term: z.string(), meaning: z.string() }));

/** Read side: `boxes` and `together` are optional so notes stored before them still parse; a null from the model counts as absent. */
export const Notes = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(Section.extend({ boxes: z.array(z.unknown()).nullish().transform((b) => (b ? keepBoxes(b) : undefined)).optional() })),
  words: Words,
  together: z.string().nullish().transform((v) => v ?? undefined).optional(),
});
export type Notes = z.infer<typeof Notes>;

// What the model fills. Strict mode: every key required, anyOf not oneOf, no tuples, so points are number[][] here.
const Wire = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(Section.extend({ boxes: z.array(z.union([Formula, Example, graph(z.array(z.number())), Mistake])) })),
  words: Words,
  together: z.string(),
});

const PROMPT =
  "You are the best note-taker in this lecture. Write study notes a student would rather have than a classmate's: " +
  "notes, not a transcript. Organise by topic, explain, and keep every formula, definition and example. " +
  "Each transcript turn is tagged with `snap` (the board snapshot on screen) and `pointing` (the third of the board the professor stood at). " +
  'Use them silently to work out what "this", "here" and "that" mean, then write it into plain sentences ("The residual plot fans out: ..."). ' +
  "Never put timestamps, snap numbers, `pointing`, speaker labels or quote = meaning glosses in `body`. " +
  "List a section's board snapshots by index in `snaps`. " +
  "Add to `exam` only what the professor said is important or will be on the test: `quote` is a short clean statement of what is examinable " +
  '(e.g. "Spotting heteroskedasticity from a residual plot: on the midterm"), not their words; `t` is that turn\'s start in seconds. ' +
  'Only when a whole section has no speech, say "no speech captured" once and write it from the board. ' +
  "Speech recognition mishears course terms, especially with an accent: when a transcript word is a misheard version of a term on the board " +
  "or in the keywords, write the board's or the keywords' spelling. Write [inaudible] for speech that stays unclear; never guess what was said. " +
  "Fill a section's `boxes` only from what was actually taught: a formula box (`tex` without $, each symbol and its meaning) when a formula was written; " +
  "a worked example (`question`, `steps`, `answer`) only when one was worked through; a graph only from real points on the board or said aloud, " +
  "never invented (`title`, axis labels `x` and `y`, each series' `points` as [x, y]); a Common mistake (`text`) only when the professor warned about one. " +
  "Most sections have no boxes: leave `boxes` empty. " +
  "In `together`, write a short closing synthesis of how the lecture's ideas connect. " +
  "Write all math as LaTeX in $...$. In `words`, define the course terms used.";

const s = (t: number) => `${Math.round(t)}s`;

export async function compose(input: { turns: LinkedTurn[]; snaps: Snapshot[]; course: string; context: string; keywords: string[] }): Promise<Notes> {
  const board = input.snaps.map((sn, i) => `### Snapshot ${i} at ${s(sn.t)}\n${sn.markdown}`).join("\n\n") || "(no board)";
  const speech =
    input.turns.map((t) => `[${s(t.start)}-${s(t.end)} snap=${t.snap ?? "none"} pointing=${t.pointing ?? "none"}] ${t.text}`).join("\n") ||
    "(no speech captured)";
  const text =
    `${PROMPT}\n\nCourse: ${input.course}\n\nKeywords: ${input.keywords.join(", ") || "(none)"}\n\n## Course material this week\n${input.context.slice(0, 20_000) || "(none)"}` +
    `\n\n## Board\n${board}\n\n## Transcript\n${speech}`;
  const res = await meta().responses.create({
    model: "muse-spark-1.3",
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text }] }],
    text: {
      format: {
        type: "json_schema",
        name: "notes",
        strict: true,
        schema: z.toJSONSchema(Wire, { target: "draft-7" }) as Record<string, unknown>,
      },
    },
  });
  const notes = Notes.parse(JSON.parse(res.output_text));
  // An invented snapshot index is dropped, never fatal: a lecture with no board must still get notes.
  for (const sec of notes.sections) sec.snaps = sec.snaps.filter((i) => Number.isInteger(i) && i >= 0 && i < input.snaps.length);
  if (!notes.together?.trim()) delete notes.together;
  return notes;
}

/** Plain markdown for the `files.text` row: board markdown stands in for the images. */
export function toMarkdown(notes: Notes, snaps: Snapshot[]): string {
  const shown = new Set<number>();
  const sections = notes.sections.map((sec) => {
    // Each board snapshot is printed once, at its first reference.
    const boards = sec.snaps.filter((i) => !shown.has(i) && shown.add(i)).map((i) => snaps[i].markdown);
    return [`## ${sec.heading}`, sec.body, ...boards, ...sec.exam.map((e) => `Exam: ${e.quote}`)].join("\n\n");
  });
  const words = notes.words.length ? ["## Terms", notes.words.map((w) => `- **${w.term}**: ${w.meaning}`).join("\n")] : [];
  return [`# ${notes.title}`, notes.summary, ...sections, ...words].join("\n\n") + "\n";
}
