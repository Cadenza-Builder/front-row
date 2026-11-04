# Front Row by Cadenza

Every AI note-taker listens. Front Row watches.

A phone faces the lecture-hall board. Front Row turns what the professor says and writes into study notes, with the board work in them, minutes after class. It is built for students who can't take their own notes: the ones Accessibility Services would otherwise assign a volunteer note-taker.

**Built during the Meta Global AI Developer Hackathon (Oct 26 to Nov 4, 2026).** Every file in this repository was written during the event, except the bundled DejaVu fonts (`lib/lectures/fonts/`, under their own licence in `LICENSE-DejaVu.txt`) used for the PDF export. Cadenza (studycadenza.com) is a pre-existing private hosted service; Front Row plugs into it, and none of Cadenza's code is here. What Front Row borrows from it is listed under [Pre-existing: Cadenza](#pre-existing-cadenza).

## Try it without a key

```sh
npm install
npm test
```

Then read [`samples/mit-18.06-lecture-3/`](samples/mit-18.06-lecture-3/): a real, unedited run on ten minutes of an MIT lecture, with the board photos it read and the Meta calls it made.

No-account demo of the recorder: [studycadenza.com/front-row/sample](https://studycadenza.com/front-row/sample) (it records nothing).

## Run it on a lecture

Needs Node 22+, `ffmpeg` and `ffprobe` on your PATH, and a Meta Model API key.

```sh
cp .env.example .env         # then put your Meta Model API key after MODEL_API_KEY=
scripts/get-sample.sh        # ten minutes of MIT 18.06 lecture 3 -> sample.mp4
npm run notes -- sample.mp4 --course "MIT 18.06" --keywords "matrix multiplication,inverse,Gauss-Jordan,row times column,identity matrix"
```

It prints the notes as markdown, then `Meta API calls:` with the count per model (transcription is listed by its path, `/v1/asr/transcribe`), and writes `notes.json`. Any lecture video works in place of `sample.mp4`. A ten-minute run takes about 4 to 10 minutes, depending on how fast Meta answers.

## Meta models

| Job | Model | Where |
|---|---|---|
| Speech to text, biased with course vocabulary | `muse-voice-transcribe-1.0` | `lib/lecture/transcribe.ts` |
| Find the board and the professor in a frame | `sam-3.1` | `lib/lecture/locate.ts` |
| Read the board (handwriting, math as LaTeX) | `muse-spark-1.3` | `lib/lecture/board.ts` |
| Plan the topics, write each topic, clean up the joins | `muse-spark-1.3` | `lib/lecture/topics.ts`, `lib/lecture/compose.ts` |

All four run on Meta's hosted Model API. The calls go through the `openai` npm package as an HTTP client pointed at `https://api.meta.ai/v1` (`lib/lecture/meta.ts`). No OpenAI model is called anywhere.

One model that is not Meta's runs in the phone app only: Google's MediaPipe Pose Landmarker (lite), in the phone's browser (`app/front-row/record/Recorder.tsx`). It draws the professor's outline on screen and skips a board photo while the professor covers over 35% of the board. It sends nothing anywhere. `npm run notes` does not use it.

## How it works

The phone records in two-minute parts. Each part is processed in the background while the next one records, so at Stop only the last part is left. The notes start writing about 3 s after Stop. A draft opens about a minute and a half later, and the final notes replace it while the student reads:

| Lecture, through the phone app | Draft opens | Final notes |
|---|---|---|
| MIT 18.06, 6 min | 1:22 after Stop | 1:56 after Stop |
| MIT 18.06, 15 min | 1:26 after Stop | 2:06 after Stop |

Most of that wait is Meta writing the notes, so it varies with how fast Meta answers.

1. **Hear.** The part's audio goes to `muse-voice-transcribe-1.0`, with the course's words as keywords so terms like "heteroskedasticity" come out right.
2. **Watch.** A frame every 10 s. A 32×18 thumbnail check (`changed.ts`) decides whether the board changed. Changed frames go to `sam-3.1`, plus the first frame and one at least every 60 s so the professor's position stays fresh. SAM returns the board and the people in front of it. The professor is the person standing at the board (centred within its height, closest to it), not a student seated below. In the phone app, SAM is also asked for the live board outline on screen: at the start, when the phone is moved, every 30 s until a board is found, then every 2 minutes.
3. **Read.** The board is read once the writing settles (the next frame is unchanged), and every 30 s during long writing so an erased board is not lost. The frame is cropped to the board and sent to `muse-spark-1.3` with the transcript nearby, so a smudged symbol can be settled by what was said. Anything it can't read comes back as `[unreadable]`, never a guess.
4. **Link and write.** Each board read is tied to what was being said at that moment (`link.ts`). After Stop, `muse-spark-1.3` plans the lecture's topics, then writes every topic at once, one call each (`topics.ts`): sections that follow the lecture, formulas boxed, worked examples checked, each section pointing to the board photo it came from. Code tidies the math and drops exam lines the professor never said, and the draft goes on screen. One last call returns edits for repeats and seams between topics; code applies only the safe ones, and a failed clean-up keeps the draft.

One failed call never fails a lecture: a frame that can't be located or read is skipped and logged. Every call has a time limit: 45 s for a frame (transcription and board reads retry once), 60 s for each topic, 90 s for the clean-up. After Stop, the whole notes step has to finish inside 280 s.

## Cost

Measured from call and token counts at Meta's list prices:

| Run | Board reads | SAM calls | Cost per lecture hour |
|---|---|---|---|
| Oxford calculus, 58 min, before this week's fixes | 196 | 1,392 | about $6.61 |
| Same lecture, after the first round of fixes | 197 | 506 | about $4.33 |
| MIT 18.06, 10 min: before → after settled + cropped reads | 41 → 20 | 92 → 92 | board-read output tokens halved (156k → 78k) |

A full 47-minute lecture through the phone app comes to about $2.60, pricing SAM at $0.0025 per call (see Known limits for why that may be low). At that rate a two-hour lecture is about $6.60.

These are estimates, not a bill. The next cut is SAM: on a phone that doesn't move, the board only needs finding again after a big picture change.

## Tested on

| Case | Result |
|---|---|
| Accented English (MIT, Oxford, Yale, Stanford, IIT Kharagpur) | 1–5% real word errors; the rest is "uh" and repeats |
| Full 58-minute lecture | 30 of 30 parts processed, every worked answer correct |
| Full 47-minute lecture through the phone app, on a night Meta was slow (20+ board-read timeouts) | every part processed, final notes 4:51 after Stop (before the Stop speed-up and the 280 s deadline were added) |
| 6- and 15-minute lectures through the phone app | draft 1:22 and 1:26 after Stop, final 1:56 and 2:06 |
| A part still processing when Stop is pressed | the notes wait for it and use its result, without doing it twice |
| Students in front of the board | the professor is picked, not the students |
| Lecture with no board | notes from the transcript alone |
| Meta call stalls | the frame is skipped, the lecture finishes |
| Long writing without a pause | read every 30 s |
| Chalkboard (MIT 18.06) | found and read; see [`samples/`](samples/mit-18.06-lecture-3/) |
| Whiteboard (our own 14-minute recording, Nov 3, the one in the demo video) | notes in two sections plus a summary, linked to 14 board photos |
| Slides on a projector screen (Stanford CS229, lecture 1) | the screen is found; blank slides come back empty, which costs calls but adds nothing wrong to the notes |
| Messy handwriting | by design, anything the reader can't make out comes back as `[unreadable]` (`board.ts`), never a guess |

## The numbers in the video (tentative)

Each figure in the demo video, what it rests on, and what it assumes. All of them come from a handful of runs, so treat them as early results, not benchmarks.

| In the video | What it rests on | Assumptions and gaps |
|---|---|---|
| A paid note-taker costs about $19 for a two-hour session | The average of published paid note-taker rates at five schools (Exeter, Auckland, Stetson, Tennessee, Towson) | Pay only, without hiring, training or admin. Rates vary by school. |
| Front Row costs about $6.60 for two hours | The 47-minute phone-app run ($2.60), scaled to 120 minutes | Meta list prices applied to our call and token counts, not a bill. SAM may cost up to 4× more (Known limits). A board that changes more often costs more. |
| Notes arrive about a minute and a half after Stop | Draft 1:22 and 1:26 after Stop on 6- and 15-minute lectures; final notes 1:56 and 2:06 | Not yet timed on a two-hour lecture. Parts are processed during recording, so Stop leaves only the last part and the writing, but a longer lecture has more topics to write, so expect the draft later. |
| "Ninety-nine percent" | Speech to text across five accents: 1–5% real word errors against the lectures' human captions, so 95–99% of words right. 99% is the top of that range. | Only speech was scored as a percentage. Chalkboard, whiteboard, projector and messy writing were run (above) but not scored. |
| SAM calls cut by about half | Oxford, 58 minutes: 1,392 → 506 SAM calls (−64%) after the first round of fixes. Reading only settled boards then halved board reads on MIT 18.06 (41 → 20). | Two different cuts, one lecture each. The settled-reads change did not reduce SAM calls (92 → 92). |
| 30 out of 30 key topics, every example from the board | Oxford, 58 minutes: 30 of 30 two-minute parts processed, the sections cover the whole hour, and every worked answer we checked was correct | "Topics" here means the 30 two-minute parts. One lecture, checked by us, not blind-scored. |

## Known limits

- **Keep Front Row on screen while recording.** iOS turns the camera off when the phone locks or another app opens.
- **Back of a large hall:** not tested yet. Far-field audio is the open risk.
- **Several boards at once:** one board is read per frame; boards are not stitched together. A blank panel can be read for nothing.
- **Spoken Greek letters:** a low-resolution zeta was heard and read as "j".
- **Lighting, glare and non-English lectures:** not tested.
- **A part Meta fails on during recording is redone after Stop,** and the student waits for it. A part still not done 90 s after Stop is also redone, which can cost a minute or two on a slow night.
- **SAM cost may be higher than shown:** if Meta bills SAM's per-request minimum on every call (up to four times the $0.0025 used above), SAM costs more than the estimate. Our own credit spend fits that higher price better.
- **Coverage on some lectures:** writing one topic per call is faster, but on MIT 18.06 lecture 10 the blind judges scored it below one long pass (5.83 vs 6.5 of 10); on lecture 3 it scored higher (6.67 vs 5.67).

## What's here

- `lib/lecture/`: the pipeline above. Runs on its own (`npm test`, `npm run notes`).
- `scripts/`: `lecture-run.mts` (the runner behind `npm run notes`) and `get-sample.sh`.
- `samples/`: real output from the runner.
- `app/front-row/`, `app/api/`, `lib/lectures/`, `supabase/`: the screens, routes and schema that plug Front Row into Cadenza (recorder, courses, notes, export, access requests). They import Cadenza's private code, so they are here to read, not to run.
- `ios/FrontRowShell.swiftpm`: the iPhone shell (one web view on Front Row). Open it in Xcode.

## Pre-existing: Cadenza

Front Row makes the notes; Cadenza shows and stores them. The pieces of Cadenza that Front Row's app code imports, all written before the event:

| Cadenza piece | Used for |
|---|---|
| Supabase clients and types | sign-in, database, file storage |
| `MathText`, the lesson page's reading bar and graph | showing math and graphs on the notes screen |
| Word export (`papers/docx`) | Download as Word |
| File reading (`extract/*`) | reading an uploaded syllabus PDF |
| Search index (`companion/search`) | Add to Cadenza: the notes become searchable in a Cadenza week |
| Run log (`runs`, `runTokens`) | logging each run's token usage |

Front Row also changed a few Cadenza files this week, which stay in Cadenza's private repo: the sign-in screen's Front Row wording, the redirect back to Front Row after sign-in, the route guard that keeps Front Row invite-only, the site nav button and the admin list of access requests.

## Privacy

Every lecture, photo and note is private to the student who recorded it (row level security on every table). During the hackathon, recording is invite-only: the event's model credits have no zero-data-retention terms, so we test on public lectures, not real classes.

## Licence

All rights reserved, © 2026 Study Cadenza Inc. Anyone may read this code, and the hackathon judges may install and run it to evaluate the submission; nothing else is licensed. See [`LICENSE`](LICENSE).
