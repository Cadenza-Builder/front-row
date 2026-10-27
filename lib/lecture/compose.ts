import { z } from "zod";
import type { Snapshot } from "./board";
import type { LinkedTurn } from "./link";
import { meta } from "./meta";

export const Notes = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      body: z.string(),
      // Not .int(): it emits min/max keywords that strict mode may reject; compose drops non-integers.
      snaps: z.array(z.number()),
      // `t` is seconds from lecture start.
      exam: z.array(z.object({ quote: z.string().describe("What is examinable, in a short clean statement"), t: z.number() })),
    }),
  ),
  words: z.array(z.object({ term: z.string(), meaning: z.string() })),
});
export type Notes = z.infer<typeof Notes>;

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
  "Write all math as LaTeX in $...$. In `words`, define the course terms used.";

const s = (t: number) => `${Math.round(t)}s`;

export async function compose(input: { turns: LinkedTurn[]; snaps: Snapshot[]; course: string; context: string }): Promise<Notes> {
  const board = input.snaps.map((sn, i) => `### Snapshot ${i} at ${s(sn.t)}\n${sn.markdown}`).join("\n\n") || "(no board)";
  const speech =
    input.turns.map((t) => `[${s(t.start)}-${s(t.end)} snap=${t.snap ?? "none"} pointing=${t.pointing ?? "none"}] ${t.text}`).join("\n") ||
    "(no speech captured)";
  const text =
    `${PROMPT}\n\nCourse: ${input.course}\n\n## Course material this week\n${input.context.slice(0, 20_000) || "(none)"}` +
    `\n\n## Board\n${board}\n\n## Transcript\n${speech}`;
  const res = await meta().responses.create({
    model: "muse-spark-1.3",
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text }] }],
    text: {
      format: {
        type: "json_schema",
        name: "notes",
        strict: true,
        schema: z.toJSONSchema(Notes, { target: "draft-7" }) as Record<string, unknown>,
      },
    },
  });
  const notes = Notes.parse(JSON.parse(res.output_text));
  // An invented snapshot index is dropped, never fatal: a lecture with no board must still get notes.
  for (const sec of notes.sections) sec.snaps = sec.snaps.filter((i) => Number.isInteger(i) && i >= 0 && i < input.snaps.length);
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
