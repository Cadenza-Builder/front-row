# Front Row by Cadenza

Every AI note-taker listens. Front Row watches.

A phone faces the lecture-hall board. Front Row turns what the professor says and writes into study notes, with the board work in them, minutes after class.

**Built during the Meta Global AI Developer Hackathon (Oct 26 to Nov 4, 2026).** Every file in this repository was written during the event. Cadenza (studycadenza.com) is a pre-existing private hosted service; Front Row plugs into it, and none of Cadenza's code is here.

## Meta models

| Job | Model |
|---|---|
| Speech to text, biased with course vocabulary | `muse-voice-transcribe-1.0` |
| Find the board and the professor in each frame | `sam-3.1` |
| Read the board (handwriting, math as LaTeX) and write the notes | `muse-spark-1.3` |

## Run it

Needs Node 22+, `ffmpeg` on your PATH, and a Meta Model API key.

```sh
npm install
echo 'MODEL_API_KEY=...' > .env
npm run notes -- lecture.mp4 --course "ECO220" --keywords "heteroskedasticity,residual"
npm test
```

## What's here

- `lib/lecture/`: the pipeline (transcribe, find the board, read it, link speech to board, write the notes). Runs on its own.
- `app/front-row/`, `app/api/`, `lib/lectures/`, `supabase/`: the screens, routes and schema that plug Front Row into Cadenza. They import Cadenza's private code, so they are here to read, not to run.
- `ios/FrontRowShell.swiftpm`: the iPhone shell (one web view on Front Row). Open it in Xcode.
