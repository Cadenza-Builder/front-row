# Sample run: MIT 18.06, lecture 3

Real, unedited output of `npm run notes` on ten minutes (1:00 to 11:00) of *Multiplication and Inverse Matrices*, Gilbert Strang, MIT 18.06 Linear Algebra. Run on 2026-11-02 at commit `fb5e4c2`, before notes were written by topic. Today's code writes the notes with one plan call, one call per topic and one clean-up call, so a new run makes a few more `muse-spark-1.3` calls and splits the notes into topic sections (a run on Nov 4 made `/v1/asr/transcribe` 7, `sam-3.1` 92, `muse-spark-1.3` 32).

```sh
scripts/get-sample.sh
npm run notes -- sample.mp4 --course "MIT 18.06" --keywords "matrix multiplication,inverse,Gauss-Jordan,row times column,identity matrix"
```

| File | What it is |
|---|---|
| [`notes.md`](notes.md) | the notes, as the runner printed them |
| [`notes.json`](notes.json) | the structured notes, the board reads (`snaps`), and `calls`: Meta API calls per model |
| [`boards/`](boards/) | the frames whose boards were read, named by second into the clip |
| [`run-log.txt`](run-log.txt) | what the runner logged, including skipped frames |

**Meta API calls in this run:** `/v1/asr/transcribe` (Muse Voice Transcribe 1.0) 6 (one per two-minute part, plus a sub-second tail), `sam-3.1` 92, `muse-spark-1.3` 26 (board reads, retries and one notes write).

Five board reads timed out at Meta (45 s, retried once) and were skipped; `run-log.txt` lists them. The run finished anyway, which is the point of the 45 s limit. The notes have no `[unreadable]` marks.

Source video: MIT OpenCourseWare, 18.06 Linear Algebra, Spring 2005, Gilbert Strang, licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/); the AI-remastered upload on [archive.org](https://archive.org/details/mit-ocw-linear-algebra-gilbert-strang-ai-remastered). The frames in `boards/` come from it and carry the same licence.
