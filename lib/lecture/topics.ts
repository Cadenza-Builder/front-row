// Notes in topics: one plan call, one writer per topic in parallel, a code tidy, then one clean-up call that returns
// guarded edits. Prompts are the ones measured and blind-judged in the topics0d prototype (2026-11-02).
import OpenAI from "openai";
import { z } from "zod";
import type { Frame, Snapshot } from "./board";
import { compose, type Notes } from "./compose";
import { link } from "./link";
import { meta } from "./meta";
import type { Turn } from "./transcribe";

export const Plan = z.object({
  title: z.string(),
  summary: z.string(),
  together: z.string(),
  topics: z.array(z.object({ heading: z.string(), start: z.number(), end: z.number(), covers: z.string() })),
});
export type Plan = z.infer<typeof Plan>;
type Topic = Plan["topics"][number];
type Usage = Record<string, { in: number; out: number }>;

const s = (t: number) => `${Math.round(t)}s`;
// Turns and frames up to 5 s either side of a topic go to its writer, as in the prototype.
const near = (topic: Topic) => (t: number) => t >= topic.start - 5 && t < topic.end + 5;

const transient = (e: unknown) => e instanceof OpenAI.APIConnectionTimeoutError || (e instanceof OpenAI.APIError && (e.status ?? 0) >= 500);
const retryOnce = <T>(f: () => Promise<T>) => f().catch((e) => (transient(e) ? f() : Promise.reject(e)));

async function ask<T extends z.ZodType>(name: string, schema: T, text: string, timeout: number) {
  const res = await meta().responses.create({
    model: "muse-spark-1.3",
    reasoning: { effort: "low" },
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text }] }],
    text: { format: { type: "json_schema", name, strict: true, schema: z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown> } },
  }, { timeout, maxRetries: 0 });
  const usage: Usage = { "muse-spark-1.3": { in: res.usage?.input_tokens ?? 0, out: res.usage?.output_tokens ?? 0 } };
  return { out: schema.parse(JSON.parse(res.output_text)) as z.infer<T>, usage };
}

/** Topics in teaching order with time ranges, plus the lecture's title, summary and together. */
export async function planTopics(input: { turns: Turn[]; snaps: Snapshot[]; course: string }) {
  const text =
    `Plan the study notes for this lecture (course: ${input.course}). Split it into its topics in teaching order: each topic gets a heading, ` +
    `its start and end in seconds (consecutive, no gaps or overlaps, covering the whole lecture), and "covers": one line on exactly what that ` +
    `topic teaches, so separate writers never repeat each other. A topic is taught material: board writing left up all lecture is not a topic. ` +
    `About one topic per 5-10 minutes. Also write the lecture's title, a two-sentence summary, and "together": a short synthesis of how the ideas connect. ` +
    `Never claim something is on an exam unless the professor said so. Math as LaTeX in $...$.\n\n` +
    `## Board\n${input.snaps.map((sn) => `[${s(sn.t)}] ${sn.markdown.slice(0, 600)}`).join("\n\n")}\n\n## Transcript\n${input.turns.map((t) => `[${s(t.start)}] ${t.text}`).join("\n")}`;
  const { out, usage } = await retryOnce(() => ask("plan", Plan, text, 120_000));
  return { plan: out, usage };
}

/** One topic's section(s). Section `snaps` index the lecture's `snaps`, not the topic's. */
export async function writeTopic(input: { topic: Topic; others: Topic[]; turns: Turn[]; frames: Frame[]; snaps: Snapshot[]; course: string; keywords: string[] }) {
  const { topic } = input;
  const inRange = near(topic);
  const mine = input.snaps.flatMap((sn, i) => (inRange(sn.t) ? [i] : []));
  const snaps = mine.map((i) => input.snaps[i]);
  const turns = link(input.turns.filter((t) => inRange(t.start)), input.frames.filter((f) => inRange(f.t)), snaps);
  const others = input.others.map((o) => `- ${o.heading}: ${o.covers}`).join("\n");
  const part =
    `\n\n## Your part\nWrite exactly ONE section, for this topic only: "${topic.heading}": ${topic.covers}. ` +
    `Other writers cover the rest of the lecture; do not explain these topics, at most name one in a sentence:\n${others}\n` +
    `Keep title, summary and together to a few words each (they are not used). In words, only the terms this section defines. ` +
    `Never claim something is on an exam unless the professor said so. ` +
    `A worked example lives only in its box: the body says in one sentence what it shows, never its steps. No "the professor", "the lecture", "below" or "above".`;
  const { notes, usage } = await retryOnce(() => compose({ turns, snaps, course: input.course, keywords: input.keywords, part }));
  return { sections: notes.sections.map((sec) => ({ ...sec, snaps: sec.snaps.map((i) => mine[i]) })), words: notes.words, usage };
}

// Two inline formulas touching ("$a$$b$") read as display math in most renderers: merge them into one.
const mergeTouching = (t: string) => t.replace(/(\$[^$\n]+)\$\$([^$\n]+\$)/g, "$1 $2");
// Formula tex and symbols carry no $ of their own (the renderer adds them).
const unwrap = (t: string) => t.trim().replace(/^\$+|\$+$/g, "");
const MATH = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/;
const outsideMath = (t: string, f: (p: string) => string) => t.split(MATH).map((p, i) => (i % 2 ? p : f(p))).join("");
// LaTeX left outside $ (a \begin{...}...\end{...} block with its \left/\right, a \command, or x_{..}) is wrapped in $...$.
const wrapLoose = (t: string) =>
  outsideMath(
    outsideMath(t, (p) => p.replace(/(?:\\left\s*\S\s*)?\\begin\{\w+\}[\s\S]*?\\end\{\w+\}(?:\s*\\right\s*\S)?(?:\s*[=+\-]?\s*(?:\\left\s*\S\s*)?\\begin\{\w+\}[\s\S]*?\\end\{\w+\}(?:\s*\\right\s*\S)?)*/g, (m) => `$${m}$`)),
    (p) => p.replace(/(?<![\w\\])((?:\\[a-zA-Z]+(?:\{[^}]*\})*|[A-Za-z]_\{[^}]+\}|[A-Za-z]_[A-Za-z0-9])(?:[^\s$]*))/g, (m) => `$${m}$`),
  );
// \begin{array}...\end{bmatrix} fails to render: each \end takes the name of the environment it closes.
const matchEnvs = (t: string) => {
  const open: string[] = [];
  return t.replace(/\\(begin|end)\{(\w+)\}/g, (m, k, n) => (k === "begin" ? (open.push(n), m) : `\\end{${open.pop() ?? n}}`));
};
const fix = (t: string) => matchEnvs(mergeTouching(wrapLoose(t)));
const EXAM = /\b(exams?|tests?|midterms?|quiz|quizzes|final)\b/i;

/** Code clean-up, no model call. `topics[i]` is the topic section i was written for. */
export function tidy(notes: Notes, turns: Turn[], topics: Topic[]): Notes {
  const n = structuredClone(notes);
  n.sections.forEach((sec, i) => {
    const inRange = near(topics[i]);
    if (!turns.some((t) => inRange(t.start) && EXAM.test(t.text))) sec.exam = [];
    sec.body = fix(sec.body);
    for (const b of sec.boxes ?? []) {
      if (b.kind === "formula") {
        b.tex = matchEnvs(unwrap(b.tex));
        for (const x of b.symbols) [x.sym, x.meaning] = [matchEnvs(unwrap(x.sym)), fix(x.meaning)];
      }
      if (b.kind === "example") {
        [b.question, b.answer] = [fix(b.question), fix(b.answer)];
        // Display math inside a numbered step breaks the list: make it inline.
        b.steps = b.steps.map((x) => matchEnvs(mergeTouching(wrapLoose(x).replace(/\$\$([\s\S]+?)\$\$/g, (_m, m: string) => `$${m.trim()}$`))));
        if (b.check) b.check = fix(b.check);
      }
      if (b.kind === "mistake") b.text = fix(b.text);
    }
  });
  // Terms: one entry per term, and only terms no section already names.
  const named = n.sections.map((x) => `${x.heading}\n${x.body}`).join("\n").toLowerCase();
  n.words = [...new Map(n.words.map((w) => [w.term.toLowerCase(), { ...w, meaning: matchEnvs(w.meaning) }])).values()].filter((w) => !named.includes(w.term.toLowerCase()));
  return n;
}

const Edits = z.object({ edits: z.array(z.object({ id: z.string(), action: z.enum(["delete", "rewrite"]), text: z.string(), keptIn: z.string() })) });
type Edit = z.infer<typeof Edits>["edits"][number];

/** Only paragraph and term edits; a delete must name where its content is kept, and that place must survive. */
export function guardEdits(edits: Edit[], ids: Set<string>): Edit[] {
  const ok = edits.filter((e) => /^s\d+\.p\d+$|^t\d+$/.test(e.id) && (e.action === "rewrite" ? e.text.trim() !== "" : ids.has(e.keptIn) && e.keptIn !== e.id));
  const deleted = new Set(ok.filter((e) => e.action === "delete").map((e) => e.id));
  return ok.filter((e) => e.action !== "delete" || !deleted.has(e.keptIn));
}

/** One call over the numbered draft; the model returns edits, code applies the guarded ones. A failure keeps the draft. */
export async function cleanUp(notes: Notes): Promise<{ notes: Notes; edits: Edit[]; usage: Usage }> {
  try {
    const units: string[] = [];
    notes.sections.forEach((sec, i) => {
      units.push(`## [s${i}] ${sec.heading}`);
      sec.body.split(/\n\n+/).forEach((p, j) => units.push(`[s${i}.p${j}] ${p}`));
      (sec.boxes ?? []).forEach((b, k) => units.push(`[s${i}.b${k}] (${b.kind} box) ${JSON.stringify(b)}`));
    });
    notes.words.forEach((w, k) => units.push(`[t${k}] Term: ${w.term}: ${w.meaning}`));
    const text =
      `These study notes were written by several writers in parallel, one section each, from one lecture. In the student's view each section shows its paragraphs first, then its boxes. ` +
      `Return only the edits needed to fix these problems, by id:\n` +
      `1. Repetition: a fact, formula, definition, example or argument stated more than once anywhere. Keep the clearest single statement (for a worked example, keep the box; for a definition, keep the first). A paragraph that retells a worked-example box is rewritten to one sentence on what the example shows. ` +
      `Delete a paragraph only when everything in it is already said elsewhere, and name that place in "keptIn" (the id of the box or earlier paragraph); otherwise rewrite it shorter, keeping every fact, example, number and stressed remark that appears nowhere else. Losing content is worse than a repeat.\n` +
      `2. Seams: a sentence that relies on something not yet shown (a later example, a box, "below", "above", "that example", "the lecture", "the professor") is rewritten to stand on its own.\n` +
      `3. A Term entry that restates a section is deleted.\n` +
      `4. A matrix or number written in a paragraph that disagrees with its box: rewrite the paragraph to match the box.\n` +
      `Rules: never add a fact; a rewrite keeps the meaning and keeps math in $...$; edit only paragraphs [s..p..] and terms [t..], never boxes; "text" is "" for a delete; "keptIn" is "" for a rewrite. If nothing needs fixing, return no edits.\n\n` +
      units.join("\n\n");
    const { out, usage } = await ask("edits", Edits, text, 90_000);
    const ids = new Set(units.flatMap((u) => u.match(/^(?:## )?\[([^\]]+)\]/)?.[1] ?? []));
    const edits = guardEdits(out.edits, ids);
    const byId = new Map(edits.map((e) => [e.id, e]));
    const n = structuredClone(notes);
    n.sections.forEach((sec, i) => {
      sec.body = sec.body.split(/\n\n+/).flatMap((p, j) => {
        const e = byId.get(`s${i}.p${j}`);
        return !e ? [p] : e.action === "delete" ? [] : [fix(e.text)];
      }).join("\n\n");
    });
    n.words = n.words.flatMap((w, k) => {
      const e = byId.get(`t${k}`);
      return !e ? [w] : e.action === "delete" ? [] : [{ ...w, meaning: fix(e.text.replace(/^Term:\s*[^:]+:\s*/, "")) }];
    });
    return { notes: n, edits, usage };
  } catch (e) {
    console.warn("lecture: clean-up failed, draft kept:", e instanceof Error ? e.message : e);
    return { notes, edits: [], usage: {} };
  }
}
