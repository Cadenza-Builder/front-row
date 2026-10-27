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
      // Not .int(): it emits min/max keywords that strict mode may reject; checkSnaps enforces integers.
      snaps: z.array(z.number()),
      // `t` is seconds from lecture start.
      exam: z.array(z.object({ quote: z.string(), t: z.number() })),
    }),
  ),
  words: z.array(z.object({ term: z.string(), meaning: z.string() })),
});
export type Notes = z.infer<typeof Notes>;

export function checkSnaps(notes: Notes, snapCount: number): Notes {
  for (const s of notes.sections)
    for (const i of s.snaps) if (!Number.isInteger(i) || i < 0 || i >= snapCount) throw new Error(`snap ${i} out of range (${snapCount} snapshots)`);
  return notes;
}

const PROMPT =
  "You are the best note-taker in this lecture. Write study notes a student would rather have than a classmate's: " +
  "notes, not a transcript. Organise by topic, explain, and keep every formula, definition and example. " +
  "Each turn is tagged with `snap` (the board snapshot on screen) and `pointing` (the third of the board the professor stood at); " +
  'use them to resolve "this", "here" and "that" to the board content they mean. ' +
  "List a section's board snapshots by index in `snaps`. " +
  "Put a line in `exam` only when the professor said it is important or will be on the test; quote them, with `t` the turn's start in seconds. " +
  'Where a stretch of the lecture has no words, say "no speech captured" for it and write from the board. ' +
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
  return checkSnaps(Notes.parse(JSON.parse(res.output_text)), input.snaps.length);
}

/** Plain markdown for the `files.text` row: board markdown stands in for the images. */
export function toMarkdown(notes: Notes, snaps: Snapshot[]): string {
  const sections = notes.sections.map((sec) =>
    [`## ${sec.heading}`, sec.body, ...sec.snaps.map((i) => snaps[i].markdown), ...sec.exam.map((e) => `Exam: ${e.quote}`)].join("\n\n"),
  );
  const words = notes.words.length ? ["## Terms", notes.words.map((w) => `- **${w.term}**: ${w.meaning}`).join("\n")] : [];
  return [`# ${notes.title}`, notes.summary, ...sections, ...words].join("\n\n") + "\n";
}
