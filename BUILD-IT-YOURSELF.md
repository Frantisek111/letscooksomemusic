# Build your own browser music studio

Work in a new folder and tick off each step after you test it. Your first goal is a **16-step kick and snare beat with adjustable tempo**. The later steps turn it into a sampler and song editor.

If this is for a class or a program that reviews your work, check its AI rules first. This Indy repository is an AI-assisted reference. Write your implementation in your own repository and disclose the help you used as required.

## 1. Set up your project

- [ ] Create a folder called `my-beat-studio` and open it in your editor.
- [ ] Create `index.html`, `style.css`, and `main.js`. Link the CSS from the HTML and load `main.js` with a module script.
- [ ] Put a heading, a Play button, and an empty element for the step grid in the HTML.
- [ ] Serve the folder locally. If you have Python 3, run this command from that folder.

  ```sh
  python3 -m http.server 8000 --bind 127.0.0.1
  ```

**Check:** Open `http://127.0.0.1:8000`. The heading and Play button appear and the browser console shows no errors.

## 2. Make a step grid

- [ ] Make an array of 16 booleans, all initially `false`.
- [ ] Use JavaScript to create 16 buttons. A button toggles the value at its own index. Use `aria-pressed` and CSS to show that value on the button.
- [ ] Style the grid so you can see four groups of four steps.

**Check:** Click steps 1, 5, 9, and 13. Only those four should light up. Click step 5 again and confirm that only that step turns off.

## 3. Play a kick and loop the pattern

- [ ] On Play, create or resume an `AudioContext`. Try playing a single kick before writing the loop.
- [ ] Write a function that takes a scheduled time. Create a sine oscillator, sweep its frequency down quickly, and fade its gain to nearly zero before stopping it.
- [ ] Track two values, the index of the next step and the audio time it should play. At 120 BPM each sixteenth-note step lasts `60 / 120 / 4` seconds.
- [ ] Use a short JavaScript timer to look ahead. Schedule each upcoming active step against `audioContext.currentTime`. Advance the index modulo 16 after every step.
- [ ] On Stop, clear the timer. Track scheduled oscillators so you can stop them too. Remove them from your list when they finish.

**Check:** Steps 1, 5, 9, and 13 should sound half a second apart at 120 BPM. Press Stop, then Play again. The loop should restart from step 1, with no second loop running underneath it.

## 4. Finish the first usable beat maker

- [ ] Add a snare row with an independent step array. Try using a short burst of filtered noise for the snare.
- [ ] Add a tempo input and mute buttons. Recalculate the step duration from the tempo. Mute should silence a row while keeping its steps.
- [ ] Save the tempo, mute settings, and step arrays with `localStorage`. Restore them when the page loads.

**Check:** Put the snare on steps 5 and 13. Change the tempo to 90 BPM, mute the snare, and reload. Check that the tempo, grid, and mute state come back.

**First milestone:** Save a commit here. Explain in your own words why the JavaScript timer wakes up early and the Web Audio clock decides when each hit sounds.

## 5. Turn it into a sampler

- [ ] Add a file input. Read a WAV as an `ArrayBuffer` and decode it with `decodeAudioData`.
- [ ] Add start and end times. Keep them inside the clip and require the end to follow the start. Preview the cut with an `AudioBufferSourceNode`; use a new source for each preview or hit.
- [ ] Let a user assign the cut to a drum row. Playback should use the cut when that row has a sample assigned.
- [ ] Draw a waveform on a canvas after trimming works. Later, add suggested slice points and microphone recording with a visible stop control.
- [ ] Move project saves to IndexedDB when you need to persist the audio itself.

**Check:** Import a clip with two distinct sounds and trim around just the second one. Assign it to the snare row, then reload and confirm the same cut still plays.

## 6. Add a piano roll and arrange a song

- [ ] Represent a note with its pitch, start step, length in steps, and instrument. Make the piano roll grid use pitch for rows and time for columns.
- [ ] Turn the pitch into a frequency with `440 * 2 ** ((pitch - 69) / 12)` for MIDI note numbers. Give the note a short attack and release so the edges sound smooth.
- [ ] Allow multiple pitches on the same step. Once chords work with one voice, make separate sounds for piano, guitar, or bass.
- [ ] Add a second bar. Store the notes for each bar separately and let the user choose which bar they are editing. You can share the same drum loop across bars before you support drum variations.

**Check:** Play C, E, and G together in bar 1. Put a different melody in bar 2. Listen from the start, then reload and verify both bars are still editable.

## 7. Mix and export

- [ ] Route each sound through its own gain and stereo pan controls. Keep the controls independent from the note and drum data.
- [ ] Render the same song with `OfflineAudioContext`. Reuse the event scheduling and mixer settings from playback.
- [ ] Write the rendered samples to a stereo PCM WAV and offer it as a download. Add MIDI export later if you need to transfer editable notes to another DAW.

**Check:** Pan one voice fully left and mute another. Download the WAV, open it in a player, and confirm the stereo position, mute, and song duration. At 120 BPM, two bars of 4/4 should be four seconds.

After each milestone, write down what worked, what you had to debug, and which part you want to improve next. Use your own words and commit the version you actually tested.
