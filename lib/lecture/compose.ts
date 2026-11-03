import { z } from "zod";
import type { Snapshot } from "./board";
import type { LinkedTurn } from "./link";
import { meta } from "./meta";

const Formula = z.object({ kind: z.literal("formula"), tex: z.string(), symbols: z.array(z.object({ sym: z.string(), meaning: z.string() })) });
// `extra` is the optional line: required-but-nullable on the wire (strict mode), optional on the read side.
const example = <E extends z.ZodType>(extra: E) =>
  z.object({ kind: z.literal("example"), question: z.string(), steps: z.array(z.string()), answer: z.string(), check: extra });
const Mistake = z.object({ kind: z.literal("mistake"), text: z.string() });
const graph = <P extends z.ZodType, E extends z.ZodType>(point: P, extra: E) =>
  z.object({ kind: z.literal("graph"), title: z.string(), caption: extra, x: z.string(), y: z.string(), series: z.array(z.object({ label: z.string(), points: z.array(point) })) });
// A null or blank caption/check is absent, never a reason to drop the box.
const line = z.string().nullish().transform((v) => (v?.trim() ? v : undefined)).optional();
// z.number() refuses Infinity, so a non-finite point fails the parse.
export const NoteBox = z.discriminatedUnion("kind", [Formula, example(line), graph(z.tuple([z.number(), z.number()]), line), Mistake]);
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
  sections: z.array(Section.extend({ boxes: z.array(z.union([Formula, example(z.string().nullable()), graph(z.array(z.number()), z.string().nullable()), Mistake])) })),
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
  "Add to `exam` only when the professor says exam, test, midterm, quiz or final: `quote` is a short clean statement of what is examinable " +
  '(e.g. "Spotting heteroskedasticity from a residual plot: on the midterm"), not their words; `t` is that turn\'s start in seconds. ' +
  "Board writing left up all lecture (an outline, a list of terms) is not a topic: use it in the sections that discuss it, never as a section of its own. " +
  'Only when a whole section has no speech, say "no speech captured" once and write it from the board. ' +
  "Speech recognition mishears course terms, especially with an accent: when a transcript word is a misheard version of a term on the board " +
  "or in the keywords, write the board's or the keywords' spelling. Write [inaudible] for speech that stays unclear; never guess what was said. " +
  "Fill a section's `boxes` only from what was actually taught: a formula box (`tex` without $, each symbol and its meaning) when a formula was written; " +
  "a worked example (`question`, `steps`, `answer`) only when one was worked through; a graph only from real points on the board or said aloud, " +
  "never invented (`title`, axis labels `x` and `y`, each series' `points` as [x, y]); a Common mistake (`text`) only when the professor warned about one. " +
  "A graph's `caption` is one sentence on what it shows, only when that adds meaning, else null. " +
  "An example's `check` is a one-line check of the answer (e.g. substituting it back), only when the example has a natural check, else null. " +
  "Most sections have no boxes: leave `boxes` empty. " +
  "In `together`, write a short closing synthesis of how the lecture's ideas connect. " +
  "Write all math as LaTeX in $...$. In `words`, define the course terms used. " +
  "Never write a placeholder, empty or meta section (e.g. about omitted snapshots).";

const s = (t: number) => `${Math.round(t)}s`;

/** The notes, and the tokens they cost per model (what Cadenza's `runs.usage` stores). `part` is appended to the prompt. */
export async function compose(input: { turns: LinkedTurn[]; snaps: Snapshot[]; course: string; keywords: string[]; part?: string; timeout?: number }) {
  const board = input.snaps.map((sn, i) => `### Snapshot ${i} at ${s(sn.t)}\n${sn.markdown}`).join("\n\n") || "(no board)";
  const speech =
    input.turns.map((t) => `[${s(t.start)}-${s(t.end)} snap=${t.snap ?? "none"} pointing=${t.pointing ?? "none"}] ${t.text}`).join("\n") ||
    "(no speech captured)";
  const text =
    `${PROMPT}\n\nCourse: ${input.course}\n\nKeywords: ${input.keywords.join(", ") || "(none)"}` +
    `\n\n## Board\n${board}\n\n## Transcript\n${speech}${input.part ?? ""}`;
  const res = await meta().responses.create({
    model: "muse-spark-1.3",
    reasoning: { effort: "low" },
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text }] }],
    text: {
      format: {
        type: "json_schema",
        name: "notes",
        strict: true,
        schema: z.toJSONSchema(Wire, { target: "draft-7" }) as Record<string, unknown>,
      },
    },
  }, { timeout: input.timeout ?? 60_000, maxRetries: 0 });
  const notes = Notes.parse(JSON.parse(res.output_text));
  // An invented snapshot index is dropped, never fatal: a lecture with no board must still get notes.
  for (const sec of notes.sections) sec.snaps = sec.snaps.filter((i) => Number.isInteger(i) && i >= 0 && i < input.snaps.length);
  // A short section with no snapshot, box or exam line is a placeholder ("Empty snapshots omitted."); keep one if all are.
  const real = notes.sections.filter((sec) => sec.snaps.length || sec.boxes?.length || sec.exam.length || sec.body.trim().length >= 80);
  notes.sections = real.length || !notes.sections.length ? real : [notes.sections.reduce((a, b) => (b.body.trim().length > a.body.trim().length ? b : a))];
  if (!notes.together?.trim()) delete notes.together;
  return { notes, usage: { "muse-spark-1.3": { in: res.usage?.input_tokens ?? 0, out: res.usage?.output_tokens ?? 0 } } };
}

/** Plain markdown for the `files.text` row and the exports. No raw board readings: they carry [unreadable], repeats and
 * their own headings, and the notes and boxes already hold what the board said. */
export function toMarkdown(notes: Notes): string {
  const sections = notes.sections.map((sec) =>
    [`## ${sec.heading}`, sec.body, ...(sec.boxes ?? []).map(boxMarkdown), ...sec.exam.map((e) => `Exam: ${e.quote}`)].join("\n\n"),
  );
  const words = notes.words.length ? ["## Terms", notes.words.map((w) => `- **${w.term}**: ${w.meaning}`).join("\n")] : [];
  const together = notes.together ? ["## Putting it together", notes.together] : [];
  return [`# ${notes.title}`, notes.summary, ...sections, ...words, ...together].join("\n\n") + "\n";
}

// Graph points are not dumped: the title, caption and axes say what the graph is.
function boxMarkdown(b: NoteBox): string {
  switch (b.kind) {
    case "formula":
      return [`$$${b.tex}$$`, ...(b.symbols.length ? [b.symbols.map((s) => `- $${s.sym}$: ${s.meaning}`).join("\n")] : [])].join("\n\n");
    case "example":
      return [
        `**Worked example:** ${b.question}`,
        b.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
        `**Answer:** ${b.answer}`,
        ...(b.check ? [`**Check:** ${b.check}`] : []),
      ].join("\n\n");
    case "graph":
      return [`**Graph: ${b.title}**`, ...(b.caption ? [b.caption] : []), `A graph of ${b.y} against ${b.x}.`].join("\n\n");
    case "mistake":
      return `**Common mistake:** ${b.text}`;
  }
}
