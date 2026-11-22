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
  const preRoll = Math.round(clip.rate * 0.002)
  for (let index = 1; index < levels.length && points.length < 16; index++) {
    const level = levels[index]
    const previous = levels[index - 1]
    if (level > Math.max(0.006, peak * 0.07, baseline * 2.4) && level - previous > peak * 0.045) {
      const threshold = Math.max(0.006, previous * 2, level * 0.4)
      const start = (index - 1) * window
      const stop = Math.min(frames, (index + 1) * window)
      for (let frame = start; frame < stop; frame++) {
        if (!clip.channels.some(channel => Math.abs(channel[frame]) >= threshold)) continue
        const time = Math.max(0, frame - preRoll) / clip.rate
        if (time - points.at(-1)! >= 0.09 && end - time >= 0.045) points.push(time)
        break
      }
    }
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
    let voice = 0
    switch (index) {
      case 0:
        phase += 2 * Math.PI * (46 + 125 * Math.exp(-time * 52)) / rate
        voice = 0.82 * Math.sin(phase) * Math.exp(-time * 15) + 0.09 * high * Math.exp(-time * 250)
        break
      case 1:
        voice = 0.32 * (0.65 * noise + 0.35 * high) * Math.exp(-time * 24)
          + 0.42 * Math.sin(time * 2 * Math.PI * 176) * Math.exp(-time * 56)
        break
      case 2:
        voice = (0.26 * high + 0.05 * Math.sin(time * 2 * Math.PI * 8173)) * Math.exp(-time * 62)
        break
      case 3:
        voice = (0.55 * Math.sin(2 * Math.PI * 390 * time + 1.4 * Math.sin(2 * Math.PI * 210 * time)) + 0.12 * noise) * Math.exp(-time * 26)
        break
    }
    data[frame] = voice * Math.min(1, frame / 35, (data.length - frame) / 100)
  }
  return { rate, channels: [data] }
}

const drums = Array.from({ length: 4 }, (_, index) => drum(index))
const buffers = new WeakMap<BaseAudioContext, WeakMap<Clip, AudioBuffer>>()

function smoothClipEdges(samples: Float32Array, rate: number) {
  // Leave most of even a very short cut at its original level.
  const limit = Math.floor(samples.length / 4)
  const attack = Math.min(limit, Math.round(rate * 0.002))
  const release = Math.min(limit, Math.round(rate * 0.005))
  for (let frame = 0; frame < attack; frame++) {
    samples[frame] *= frame / attack
  }
  for (let frame = 0; frame < release; frame++) {
    samples[samples.length - 1 - frame] *= frame / release
  }
}

export function playClip(context: BaseAudioContext, clip: Clip, time: number, volume = 1) {
  let cache = buffers.get(context)
  if (!cache) {
    cache = new WeakMap()
    buffers.set(context, cache)
  }
  let buffer = cache.get(clip)
  if (!buffer) {
    const decoded = context.createBuffer(clip.channels.length, clip.channels[0].length, clip.rate)
    const isStockDrum = drums.includes(clip)
    clip.channels.forEach((channel, index) => {
      const samples = decoded.getChannelData(index)
      samples.set(channel)
      if (!isStockDrum) smoothClipEdges(samples, clip.rate)
    })
    buffer = decoded
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
  let peak = 1
  for (let frame = 0; frame < length; frame++) {
    peak = Math.max(peak, Math.abs(left[frame]), Math.abs(right[frame]))
  }
  // Apply one gain to the whole mix so overload protection preserves the stereo balance.
  const pcm = (sample: number) => Math.round(sample / peak * (sample < 0 ? 32768 : 32767))
  for (let frame = 0; frame < length; frame++) {
    view.setInt16(44 + frame * 4, pcm(left[frame]), true)
    view.setInt16(46 + frame * 4, pcm(right[frame]), true)
  }
  return new Blob([bytes], { type: 'audio/wav' })
}
