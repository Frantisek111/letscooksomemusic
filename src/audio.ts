import type { Clip, Session, Slice } from './storage.ts'

export const duration = (clip: Clip) => clip.channels[0].length / clip.rate

export function fromBuffer(buffer: AudioBuffer): Clip {
  return {
    rate: buffer.sampleRate,
    channels: Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, index) => buffer.getChannelData(index).slice()),
  }
}

export function trim(clip: Clip, slice: Slice): Clip {
  const start = Math.floor(slice.start * clip.rate)
  const end = Math.max(start + 1, Math.round(slice.end * clip.rate))
  return { rate: clip.rate, channels: clip.channels.map(channel => channel.slice(start, end)) }
}

export function detectSlices(clip: Clip): Slice[] {
  const window = Math.max(1, Math.round(clip.rate * 0.01))
  const levels: number[] = []
  const frames = clip.channels[0].length
  for (let start = 0; start < frames; start += window) {
    let energy = 0
    const end = Math.min(frames, start + window)
    for (const channel of clip.channels) {
      for (let frame = start; frame < end; frame++) energy += channel[frame] ** 2
    }
    levels.push(Math.sqrt(energy / ((end - start) * clip.channels.length)))
  }
  const peak = levels.reduce((max, level) => Math.max(max, level), 0)
  const points = [0]
  const end = duration(clip)
  let baseline = levels[0]
  for (let index = 1; index < levels.length && points.length < 16; index++) {
    const time = (index - 1) * window / clip.rate
    const level = levels[index]
    if (time - points.at(-1)! >= 0.09 && end - time >= 0.045 &&
        level > Math.max(0.006, peak * 0.07, baseline * 2.4) &&
        level - levels[index - 1] > peak * 0.045) points.push(time)
    baseline += (level - baseline) * 0.13
  }
  return points.map((start, index) => ({ start, end: points[index + 1] ?? end }))
}

function drum(index: number): Clip {
  const rate = 44100
  const data = new Float32Array(Math.round(rate * [0.34, 0.22, 0.10, 0.23][index]))
  let seed = 11
  let previous = 0
  let phase = 0
  for (let frame = 0; frame < data.length; frame++) {
    const time = frame / rate
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const noise = seed / 2147483648 - 1
    const high = noise - previous
    previous = noise
    phase += 2 * Math.PI * (48 + 108 * Math.exp(-time * 48)) / rate
    const voices = [
      0.82 * Math.sin(phase) * Math.exp(-time * 15),
      (0.34 * noise + 0.46 * Math.sin(time * 2 * Math.PI * 176) * Math.exp(-time * 33)) * Math.exp(-time * 21),
      0.29 * high * Math.exp(-time * 49),
      (0.55 * Math.sin(2 * Math.PI * 390 * time + 1.4 * Math.sin(2 * Math.PI * 210 * time)) + 0.12 * noise) * Math.exp(-time * 26),
    ]
    data[frame] = voices[index] * Math.min(1, frame / 35, (data.length - frame) / 100)
  }
  return { rate, channels: [data] }
}

const drums = Array.from({ length: 4 }, (_, index) => drum(index))
const buffers = new WeakMap<BaseAudioContext, WeakMap<Clip, AudioBuffer>>()

export function playClip(context: BaseAudioContext, clip: Clip, time: number, volume = 1) {
  let cache = buffers.get(context)
  if (!cache) {
    cache = new WeakMap()
    buffers.set(context, cache)
  }
  let buffer = cache.get(clip)
  if (!buffer) {
    buffer = context.createBuffer(clip.channels.length, clip.channels[0].length, clip.rate)
    clip.channels.forEach((channel, index) => buffer!.getChannelData(index).set(channel))
    cache.set(clip, buffer)
  }
  const source = context.createBufferSource()
  const gain = context.createGain()
  source.buffer = buffer
  gain.gain.value = volume
  source.connect(gain).connect(context.destination)
  source.start(time)
  source.onended = () => {
    source.disconnect()
    gain.disconnect()
  }
  return source
}

export function playStep(context: BaseAudioContext, session: Session, step: number, time: number) {
  return session.tracks.flatMap((track, index) => track.steps[step] && !track.muted
    ? [playClip(context, track.sample ?? drums[index], time, 0.24)]
    : [])
}

export const stepLength = (bpm: number) => 60 / bpm / 4

export async function exportWav(session: Session): Promise<Blob> {
  const rate = 44100
  const length = Math.round(rate * stepLength(session.bpm) * 16)
  const context = new OfflineAudioContext(2, length, rate)
  for (let step = 0; step < 16; step++) playStep(context, session, step, step * stepLength(session.bpm))
  const audio = await context.startRendering()
  const bytes = new ArrayBuffer(44 + length * 4)
  const view = new DataView(bytes)
  const label = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index))
  }
  label(0, 'RIFF')
  view.setUint32(4, bytes.byteLength - 8, true)
  label(8, 'WAVE')
  label(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 2, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  label(36, 'data')
  view.setUint32(40, length * 4, true)
  const left = audio.getChannelData(0)
  const right = audio.getChannelData(1)
  for (let frame = 0; frame < length; frame++) {
    view.setInt16(44 + frame * 4, Math.round(Math.max(-1, Math.min(1, left[frame])) * 32767), true)
    view.setInt16(46 + frame * 4, Math.round(Math.max(-1, Math.min(1, right[frame])) * 32767), true)
  }
  return new Blob([bytes], { type: 'audio/wav' })
}
