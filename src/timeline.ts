import './timeline.css'

interface TimelineState {
  selected: number
  playing: number
  bars: { drums: number; notes: number }[]
}

export function mountTimeline(root: HTMLElement, select: (bar: number) => void) {
  const buttons = Array.from({ length: 8 }, (_, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'timeline-bar'
    button.innerHTML = `<strong>Bar ${index + 1}</strong><span></span>`
    button.onclick = () => select(index)
    root.append(button)
    return button
  })

  return ({ selected, playing, bars }: TimelineState) => {
    buttons.forEach((button, index) => {
      const bar = bars[index]
      button.hidden = !bar
      if (!bar) return
      button.setAttribute('aria-pressed', String(index === selected))
      button.classList.toggle('playing', index === playing)
      button.querySelector('span')!.textContent =
        `${bar.drums} ${bar.drums === 1 ? 'hit' : 'hits'} · ${bar.notes} ${bar.notes === 1 ? 'note' : 'notes'}`
    })
  }
}
