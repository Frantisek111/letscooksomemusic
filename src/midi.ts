import type { Instrument, Session } from './storage.ts'

const ticksPerQuarter = 480
const ticksPerStep = ticksPerQuarter / 4
const stepsPerBar = 16
const maxBars = 8

const instruments = {
  piano: { label: 'Piano', channel: 0, program: 0 },
  guitar: { label: 'Guitar', channel: 1, program: 24 },
  bass: { label: 'Bass', channel: 2, program: 33 },
} satisfies Record<Instrument, { label: string; channel: number; program: number }>

const drums = [
  ['kick', 36],
  ['snare', 38],
  ['hat', 42],
  ['percussion', 56],
] as const

type Event = { tick: number; bytes: number[] }

function appendDelta(bytes: number[], delta: number) {
  const encoded = [delta & 0x7f]
  for (delta >>>= 7; delta > 0; delta >>>= 7) encoded.push((delta & 0x7f) | 0x80)
  bytes.push(...encoded.reverse())
}

function trackChunk(name: string, events: Event[], duration: number) {
  const nameBytes = new TextEncoder().encode(name)
  const bytes = [0, 0xff, 0x03, nameBytes.length, ...nameBytes]
  // Program changes and releases must precede attacks on the same tick.
  const attack = (event: Event) => Number((event.bytes[0] & 0xf0) === 0x90)
  events.sort((a, b) => a.tick - b.tick || attack(a) - attack(b))
  let tick = 0
  for (const event of events) {
    appendDelta(bytes, event.tick - tick)
    bytes.push(...event.bytes)
    tick = event.tick
  }
  appendDelta(bytes, duration - tick)
  bytes.push(0xff, 0x2f, 0)
  const chunk = new Uint8Array(8 + bytes.length)
  chunk.set([0x4d, 0x54, 0x72, 0x6b])
  new DataView(chunk.buffer).setUint32(4, bytes.length)
  chunk.set(bytes, 8)
  return chunk
}

function velocity(level = 1, nominal: number) {
  return Math.round(Math.min(1, Math.max(0, Number.isFinite(level) ? level : 1)) * nominal)
}

function addNote(events: Event[], channel: number, pitch: number, tick: number, length: number, strength: number) {
  events.push(
    { tick, bytes: [0x90 | channel, pitch, strength] },
    { tick: tick + length, bytes: [0x80 | channel, pitch, 0] },
  )
}

export function exportMidi(session: Session): Blob {
  const barCount = Math.min(maxBars, session.bars?.length || 1)
  const end = barCount * stepsPerBar * ticksPerStep
  const bpm = Number.isFinite(session.bpm) ? Math.min(300, Math.max(30, session.bpm)) : 120
  const tempo = Math.round(60_000_000 / bpm)
  const conductor: Event[] = [
    { tick: 0, bytes: [0xff, 0x51, 3, tempo >>> 16, (tempo >>> 8) & 0xff, tempo & 0xff] },
    { tick: 0, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] },
  ]
  const melodic: Record<Instrument, Event[]> = { piano: [], guitar: [], bass: [] }
  for (const instrument of Object.keys(instruments) as Instrument[]) {
    const { channel, program } = instruments[instrument]
    melodic[instrument].push({ tick: 0, bytes: [0xc0 | channel, program] })
  }
  const percussion: Event[] = []
  // The optional per-bar drum pattern falls back to the original shared grid.
  const { drumBars } = session as Session & { drumBars?: (boolean[][] | null)[] }
  for (let bar = 0; bar < barCount; bar++) {
    const barStart = bar * stepsPerBar * ticksPerStep
    drums.forEach(([name, pitch], index) => {
      const track = session.tracks[index]
      const mix = session.mix?.[name]
      const strength = velocity(mix?.level, 100)
      if (!track || track.muted || !strength) return
      const steps = drumBars?.[bar]?.[index] ?? track.steps
      for (let step = 0; step < stepsPerBar; step++) {
        if (steps[step] === true) addNote(percussion, 9, pitch, barStart + step * ticksPerStep, ticksPerStep, strength)
      }
    })
    const notes = session.bars?.[bar] ?? []
    const seen = new Set<number>()
    // There can be at most one note for each instrument, pitch and step.
    const limit = Math.min(notes.length, 3 * 128 * stepsPerBar)
    for (let index = 0; index < limit; index++) {
      const note = notes[index]
      if (!note || !Object.hasOwn(instruments, note.instrument)) continue
      const { instrument, pitch, step, length } = note
      if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127 ||
          !Number.isInteger(step) || step < 0 || step >= stepsPerBar ||
          !Number.isInteger(length) || length < 1) continue
      const { channel } = instruments[instrument]
      const key = (channel * 128 + pitch) * stepsPerBar + step
      if (seen.has(key)) continue
      seen.add(key)
      const mix = session.mix?.[instrument]
      const strength = velocity(mix?.level, 90)
      if (mix?.muted || !strength) continue
      addNote(melodic[instrument], channel, pitch, barStart + step * ticksPerStep,
        Math.min(length, stepsPerBar - step) * ticksPerStep, strength)
    }
  }
  const tracks = [
    trackChunk('Tempo', conductor, end),
    ...Object.entries(instruments).map(([instrument, { label }]) => trackChunk(label, melodic[instrument as Instrument], end)),
    trackChunk('Drums', percussion, end),
  ]
  const header = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, 0, 0])
  new DataView(header.buffer).setUint16(12, ticksPerQuarter)
  return new Blob([header, ...tracks], { type: 'audio/midi' })
}
