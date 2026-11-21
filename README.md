# Lets cook a music

A browser-local sampler and four-track drum sequencer built with TypeScript, Vite, and the Web Audio API.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Microphone recording requires localhost or HTTPS and browser microphone permission.

Record up to 16 seconds or import audio. Select a suggested slice, adjust its handles or times, and preview it. Drag a slice onto a track name or step, or use **Assign Slice**. Drag an active step to move the hit. A track name keeps the original step timing, and an occupied destination keeps both hits in place.

Use **Export WAV** to download one bar of the current beat. The grid and audio are saved in the browser's IndexedDB.
