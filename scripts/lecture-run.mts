// A lecture video into notes, the same path the phone recorder takes. Needs ffmpeg/ffprobe and MODEL_API_KEY:
//   npx tsx --env-file=.env.local scripts/lecture-run.mts <video.mp4> --course "ECO220" --keywords "a,b,c"
// (plain `node` cannot load lib/lecture's extensionless imports.) Prints the markdown, writes notes.json here.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { imageChanged } from "../lib/lecture/changed";
import { finishLecture, processSegment } from "../lib/lecture/pipeline";

const run = promisify(execFile);
const SEG = 120; // seconds per segment, cut with 3 s of overlap
const EVERY = 10; // seconds between frames
const THUMB = 32 * 18;

const { values, positionals } = parseArgs({ allowPositionals: true, options: { course: { type: "string" }, keywords: { type: "string" } } });
const video = positionals[0];
if (!video || !values.course) throw new Error('usage: lecture-run.mts <video.mp4> --course "ECO220" [--keywords "a,b,c"]');
const keywords = (values.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean);

const dir = await mkdtemp(join(tmpdir(), "lecture-"));
try {
  const duration = Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video])).stdout);
  await run("ffmpeg", ["-v", "error", "-i", video, "-vf", `fps=1/${EVERY},scale=1280:-2`, join(dir, "f%05d.jpg")]);
  const thumbs = (
    await run("ffmpeg", ["-v", "error", "-i", video, "-vf", `fps=1/${EVERY},scale=32:18,format=gray`, "-f", "rawvideo", "-"], {
      encoding: "buffer",
      maxBuffer: 1 << 30,
    })
  ).stdout;
  const count = thumbs.length / THUMB;
  // shortcut: frame i is taken as t = i × 10 s; fps picks the nearest source frame, within a few seconds.
  const frames = await Promise.all(
    Array.from({ length: count }, async (_, i) => ({
      t: i * EVERY,
      url: `data:image/jpeg;base64,${(await readFile(join(dir, `f${String(i + 1).padStart(5, "0")}.jpg`))).toString("base64")}`,
      changed: i > 0 && imageChanged(thumbs.subarray((i - 1) * THUMB, i * THUMB), thumbs.subarray(i * THUMB, (i + 1) * THUMB)),
    })),
  );

  const segments = [];
  for (let start = 0; start < duration; start += SEG) {
    const wav = join(dir, "seg.wav");
    await run("ffmpeg", ["-v", "error", "-y", "-ss", `${start}`, "-t", `${SEG + 3}`, "-i", video, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", wav]);
    console.error(`segment ${start}s of ${Math.round(duration)}s`);
    segments.push(
      await processSegment({
        wav: new Blob([await readFile(wav)], { type: "audio/wav" }),
        offset: start,
        frames: frames.filter((f) => f.t >= start && f.t < start + SEG),
        keywords,
      }),
    );
  }

  const { notes, snaps, markdown } = await finishLecture(segments, values.course, "");
  await writeFile("notes.json", JSON.stringify({ notes, snaps }, null, 2));
  console.log(markdown);
} finally {
  await rm(dir, { recursive: true, force: true });
}
