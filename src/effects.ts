export type Effects = { room: number; compression: number }

function roomImpulse(context: BaseAudioContext): AudioBuffer {
  const rate = context.sampleRate
  const impulse = context.createBuffer(2, Math.round(.33 * rate), rate)
  const reflections = [
    [[.013, .32], [.024, -.22], [.039, .16], [.056, -.10]],
    [[.017, .28], [.029, .21], [.045, -.17], [.061, .09]],
  ]
  let seed = 173
  for (const [channel, taps] of reflections.entries()) {
    const samples = impulse.getChannelData(channel)
    const diffuseStart = Math.round(.023 * rate)
    for (let index = diffuseStart; index < samples.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const time = (index - diffuseStart) / rate
      const envelope = Math.min(1, time / .016) * Math.exp(-time / .063)
      samples[index] = (seed / 0x80000000 - 1) * envelope * .022 * Math.sqrt(48000 / rate)
    }
    for (const [time, gain] of taps) samples[Math.round(time * rate)] += gain
  }
  return impulse
}

export function createEffects(context: BaseAudioContext): {
  input: AudioNode
  update(settings: Partial<Effects>): void
} {
  const input = context.createGain()
  const mix = context.createGain()
  const room = context.createConvolver()
  const wet = context.createGain()
  const bypass = context.createGain()
  const compressor = context.createDynamicsCompressor()
  const compressed = context.createGain()

  room.normalize = false
  room.buffer = roomImpulse(context)
  wet.gain.value = 0
  compressed.gain.value = 0
  compressor.threshold.value = 0
  compressor.knee.value = 6
  compressor.ratio.value = 1
  compressor.attack.value = .004
  compressor.release.value = .14

  input.connect(mix)
  input.connect(room).connect(wet).connect(mix)
  mix.connect(bypass).connect(context.destination)
  mix.connect(compressor).connect(compressed).connect(context.destination)

  function set(parameter: AudioParam, value: number) {
    if (context.currentTime === 0) parameter.value = value
    else parameter.setTargetAtTime(value, context.currentTime, .008)
  }

  return {
    input,
    update(settings) {
      if (settings.room !== undefined && Number.isFinite(settings.room)) {
        const amount = Math.max(0, Math.min(1, settings.room))
        set(wet.gain, .36 * amount)
      }
      if (settings.compression !== undefined && Number.isFinite(settings.compression)) {
        const amount = Math.max(0, Math.min(1, settings.compression))
        set(compressor.threshold, -24 * amount)
        set(compressor.ratio, 1 + 5 * amount)
        // The compressor delays its output. Keep a direct path at zero and
        // avoid blending the two paths once the switch has settled.
        set(bypass.gain, amount === 0 ? 1 : 0)
        set(compressed.gain, amount === 0 ? 0 : 1)
      }
    },
  }
}
