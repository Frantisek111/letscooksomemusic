import type { Clip, Instrument } from './storage.ts'

export const instruments = {
  piano: 'Piano',
  guitar: 'Guitar',
  bass: 'Bass',
} satisfies Record<Instrument, string>

const rate = 44100
const voices = new Map<string, Clip>()

const partials = {
  piano: [1, .34, .17, .085, .036],
  guitar: [1, .38, .23, .16, .11, .07, .035],
  bass: [1, .23, .09, .045],
} satisfies Record<Instrument, number[]>

export function instrumentClip(instrument: Instrument, pitch: number, seconds: number): Clip {
  const heldFrames = Math.max(1, Math.round(rate * seconds))
  const key = `${instrument}:${pitch}:${heldFrames}`
  const cached = voices.get(key)
  if (cached) return cached

  const release = instrument === 'piano' ? .17 : instrument === 'guitar' ? .095 : .065
  const releaseFrames = Math.round(rate * release)
  const samples = new Float32Array(heldFrames + releaseFrames)
  const frequency = 440 * 2 ** ((pitch - 69) / 12)
  const attack = rate * (instrument === 'bass' ? .014 : .004)
  const fundamentalPhase = 2 * Math.PI * frequency / rate
  const decay = instrument === 'guitar' ? 4.4 : instrument === 'piano' ? 2.6 : 1.15
  const harmonics = partials[instrument]
  for (let frame = 0; frame < samples.length; frame++) {
    const time = frame / rate
    const fade = Math.min(frame / attack, 1, (samples.length - 1 - frame) / releaseFrames)
    let wave = 0
    for (let index = 0; index < harmonics.length; index++) {
      const harmonic = index + 1
      if (frequency * harmonic >= rate / 2) break
      const stretch = instrument === 'piano' ? Math.sqrt(1 + .0008 * index ** 2) : 1
      wave += harmonics[index] * Math.sin(frame * fundamentalPhase * harmonic * stretch)
        * Math.exp(-time * (decay + index * 2.2))
    }
    samples[frame] = .44 * wave * fade
  }
  const clip = { rate, channels: [samples] }
  if (voices.size >= 192) voices.delete(voices.keys().next().value!)
  voices.set(key, clip)
  return clip
}
