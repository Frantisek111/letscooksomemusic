# Lets cook a music

A browser-local sampler and four-track drum sequencer built with TypeScript, Vite, and the Web Audio API.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Microphone recording requires localhost or HTTPS and browser microphone permission.

Record up to 16 seconds or import audio. Select a suggested slice, adjust its handles or times, and preview it. Drag a slice onto a track name or step, or use **Assign Slice**. Drag an active step to move the hit. A track name keeps the original step timing, and an occupied destination keeps both hits in place.

Use the **Piano roll** to add synthesized piano, guitar, and bass. Pick an instrument, octave, and note length, then click notes into the grid. Add notes on the same step to form chords. Use the arrow keys to navigate the grid and Enter to toggle a note.

Set **Song length** to up to eight bars and use **Edit bar** to arrange different melodies over the repeating drum pattern. **Export WAV** renders the whole arrangement. The arrangement, drums, and samples are saved in the browser's IndexedDB.
