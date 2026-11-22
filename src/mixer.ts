import './mixer.css'

const channels = [
  ['kick', 'Kick'],
  ['snare', 'Snare'],
  ['hat', 'Hi-hat'],
  ['percussion', 'Percussion'],
  ['piano', 'Piano'],
  ['guitar', 'Guitar'],
  ['bass', 'Bass'],
] as const

export type Channel = typeof channels[number][0]
type ChannelMix = { level: number; pan: number; muted: boolean }
export type Mix = Partial<Record<Channel, ChannelMix>>

const defaults: ChannelMix = { level: 1, pan: 0, muted: false }

function panText(pan: number) {
  const amount = Math.round(Math.abs(pan) * 100)
  if (amount === 0) return 'Center'
  return `${amount}% ${pan < 0 ? 'left' : 'right'}`
}

export function mountMixer(root: HTMLElement, read: () => Mix, write: (mix: Mix) => void) {
  const grid = document.createElement('div')
  grid.className = 'mixer-channels'

  const strips = channels.map(([channel, name]) => {
    const strip = document.createElement('fieldset')
    strip.className = 'mixer-channel'
    strip.innerHTML = `
      <legend>${name}</legend>
      <label class="mixer-control">
        <span>Level</span><span class="mixer-value" aria-hidden="true"></span>
        <input type="range" min="0" max="1" step="0.01" aria-label="${name} level">
      </label>
      <label class="mixer-control">
        <span>Pan</span><span class="mixer-value" aria-hidden="true"></span>
        <input type="range" min="-1" max="1" step="0.01" aria-label="${name} pan">
      </label>
      <button type="button" class="mixer-mute" aria-label="Mute ${name}" aria-pressed="false">Mute</button>
    `
    const [level, pan] = strip.querySelectorAll('input')
    const [levelValue, panValue] = strip.querySelectorAll('.mixer-value')
    const mute = strip.querySelector('button')!

    const render = (state: ChannelMix) => {
      level.value = String(state.level)
      pan.value = String(state.pan)
      const levelText = `${Math.round(level.valueAsNumber * 100)}%`
      const position = panText(pan.valueAsNumber)
      levelValue.textContent = levelText
      panValue.textContent = position
      level.setAttribute('aria-valuetext', levelText)
      pan.setAttribute('aria-valuetext', position)
      mute.textContent = state.muted ? 'Muted' : 'Mute'
      mute.setAttribute('aria-pressed', String(state.muted))
    }

    const update = (patch: (state: ChannelMix) => Partial<ChannelMix>) => {
      const mix = read()
      const current = mix[channel] ?? defaults
      const next = { ...current, ...patch(current) }
      write({ ...mix, [channel]: next })
      render(next)
    }

    level.addEventListener('input', () => update(() => ({ level: level.valueAsNumber })))
    pan.addEventListener('input', () => update(() => ({ pan: pan.valueAsNumber })))
    mute.addEventListener('click', () => update(state => ({ muted: !state.muted })))
    grid.append(strip)
    return { channel, render }
  })

  const refresh = () => {
    const mix = read()
    for (const { channel, render } of strips) render(mix[channel] ?? defaults)
  }

  root.replaceChildren(grid)
  refresh()
  return refresh
}
