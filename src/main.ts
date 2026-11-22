import { applyMix, detectSlices, drumChannels, duration, exportWav, fromBuffer, playClip, playStep, songSteps, stepLength, trim } from './audio.ts'
import { instrumentClip, instruments } from './instruments.ts'
import { mountMixer } from './mixer.ts'
import type { Mix } from './mixer.ts'
import { presets } from './presets.ts'
import { load, save } from './storage.ts'
import type { Clip, Instrument, Session, Slice } from './storage.ts'

const names = ['Kick', 'Snare', 'Hi-hat', 'Percussion']
const colors = ['#ff976d', '#f8ca76', '#95dfbf', '#bba8fa']
let session: Session = {
  bpm: 120,
  tracks: names.map(() => ({ steps: Array(16).fill(false), muted: false, sample: null })),
  recording: null, name: '', slices: [], selected: 0,
}

const studio = document.querySelector<HTMLElement>('#studio')!
studio.innerHTML = `
  <header class="top">
    <div class="brand"><span class="mark" aria-hidden="true">▂▅▃▇</span><h1>Lets cook a music</h1></div>
    <button id="export" class="primary" type="button">Export WAV</button>
  </header>
  <section class="panel editor" aria-labelledby="editor-title">
    <div class="panel-head">
      <div><h2 id="editor-title">Sample editor</h2><p id="filename">No recording loaded</p></div>
      <div class="controls">
        <button id="record" type="button"><span class="record-dot" aria-hidden="true"></span><span id="record-label">Record</span></button>
        <button id="import" type="button">Import audio</button>
        <input id="file" type="file" accept="audio/*,.wav,.aiff,.flac,.mp3,.ogg,.m4a" hidden>
      </div>
    </div>
    <div class="wave-shell">
      <div class="wave" id="wave">
        <canvas aria-hidden="true"></canvas>
        <div id="empty" class="empty"><span aria-hidden="true">▂▅▃▇▂</span><span>Record or import audio to start slicing</span></div>
        <div id="trim-overlay" class="trim-overlay" hidden>
          <button id="trim-start" class="handle start" type="button" aria-label="Drag slice start"></button>
          <button id="trim-end" class="handle end" type="button" aria-label="Drag slice end"></button>
        </div>
      </div>
      <div class="ruler" id="ruler" aria-hidden="true"></div>
    </div>
    <div class="slice-toolbar">
      <div id="slices" class="slices" aria-label="Slices"></div>
      <div class="controls slice-controls">
        <label class="number-field">Start <input id="start" aria-label="Slice start in seconds" type="number" step=".001" min="0" disabled><span>s</span></label>
        <label class="number-field">End <input id="end" aria-label="Slice end in seconds" type="number" step=".001" min="0" disabled><span>s</span></label>
        <button id="preview" type="button" disabled>▶ Preview</button>
        <button id="assign" type="button" disabled>Assign Slice</button>
      </div>
    </div>
  </section>
  <section class="panel sequencer" aria-labelledby="seq-title">
    <div class="panel-head">
      <div><h2 id="seq-title">Step sequencer</h2><p>4 tracks · 16 steps</p></div>
      <div class="controls">
        <label class="number-field tempo"><input id="bpm" aria-label="Tempo in BPM" type="number" min="30" max="300" step="1" value="120"><span>BPM</span></label>
        <button id="clear" type="button">Clear Steps</button>
        <button id="play" class="play" type="button" aria-pressed="false">▶ Play</button>
      </div>
    </div>
    <div class="grid-scroll"><div class="grid" id="grid"></div></div>
  </section>
  <section class="panel melody" aria-labelledby="melody-title">
    <div class="panel-head">
      <div><h2 id="melody-title">Piano roll</h2><p>Place notes and chords over the drum loop</p></div>
      <div class="controls">
        <label class="number-field">Song length <select id="song-length">${Array.from({length:8}, (_, index) => `<option value="${index + 1}">${index + 1} ${index === 0 ? 'bar' : 'bars'}</option>`).join('')}</select></label>
        <label class="number-field">Edit bar <select id="edit-bar"><option value="0">1</option></select></label>
        <button id="starter-open" type="button">Load starter</button>
      </div>
    </div>
    <div class="controls roll-controls">
      <label class="number-field">Instrument <select id="instrument">${Object.entries(instruments).map(([value, name]) => `<option value="${value}">${name}</option>`).join('')}</select></label>
      <label class="number-field">Octave <select id="octave">${[2, 3, 4, 5, 6].map(octave => `<option${octave === 4 ? ' selected' : ''}>${octave}</option>`).join('')}</select></label>
      <label class="number-field">Note length <select id="note-length"><option value="1">1 step</option><option value="2">2 steps</option><option value="4">4 steps</option><option value="8">8 steps</option></select></label>
      <button id="roll-play" class="play" type="button" aria-pressed="false">▶ Play</button>
      <span id="playing-bar" hidden></span>
    </div>
    <div class="grid-scroll"><div class="grid piano-roll" id="piano-roll" role="group" aria-label="Piano roll notes"></div></div>
  </section>
  <section class="panel mixer-panel" aria-labelledby="mixer-title">
    <div class="panel-head"><h2 id="mixer-title">Mixer</h2></div>
    <div id="mixer"></div>
  </section>
  <div class="footer"><span id="status" role="status">Loading session…</span><span>Audio stays on this device</span></div>
  <dialog id="assign-dialog" aria-labelledby="assign-title">
    <form method="dialog">
      <h2 id="assign-title">Assign Slice</h2>
      <label>Track <select id="assign-track">${names.map((name, index) => `<option value="${index}">${name}</option>`).join('')}</select></label>
      <label>Destination <select id="assign-step"><option value="-1">Track sound</option>${Array.from({length:16}, (_, index) => `<option value="${index}">Step ${index + 1}</option>`).join('')}</select></label>
      <div class="controls"><button value="cancel">Cancel</button><button id="destination-confirm" class="primary" value="assign">Assign</button></div>
    </form>
  </dialog>
  <dialog id="starter-dialog" aria-labelledby="starter-title">
    <form method="dialog">
      <h2 id="starter-title">Load a starter song</h2>
      <label>Starter <select id="starter-select"></select></label>
      <p>Loading replaces the drum steps, notes, and tempo. Your samples and mixer settings are kept.</p>
      <div class="controls"><button value="cancel">Cancel</button><button value="load" class="primary">Load song</button></div>
    </form>
  </dialog>
  <div id="drag-ghost" class="drag-ghost" hidden></div>
`

const get = <T extends HTMLElement = HTMLButtonElement>(id: string) => document.getElementById(id) as T
const grid = get<HTMLDivElement>('grid')
const gridScroll = grid.parentElement!
const wave = get<HTMLDivElement>('wave')
const canvas = wave.querySelector('canvas')!
const startInput = get<HTMLInputElement>('start')
const endInput = get<HTMLInputElement>('end')
const bpmInput = get<HTMLInputElement>('bpm')
const fileInput = get<HTMLInputElement>('file')
const sliceList = get<HTMLDivElement>('slices')
const dialog = get<HTMLDialogElement>('assign-dialog')
const overlay = get<HTMLDivElement>('trim-overlay')
const ghost = get<HTMLDivElement>('drag-ghost')
const pianoRoll = get<HTMLDivElement>('piano-roll')
const songLength = get<HTMLSelectElement>('song-length')
const editBar = get<HTMLSelectElement>('edit-bar')
const instrumentInput = get<HTMLSelectElement>('instrument')
const octaveInput = get<HTMLSelectElement>('octave')
const noteLength = get<HTMLSelectElement>('note-length')
const pitches = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

grid.innerHTML = `<div class="grid-corner">Track</div>${Array.from({length:16}, (_, index) => `<div class="step-number ${index % 4 === 0 ? 'beat' : ''}" data-column="${index}">${String(index + 1).padStart(2, '0')}</div>`).join('')}
${names.map((name, track) => `
  <div class="track" style="--track-color:${colors[track]}">
    <div class="track-name" data-track="${track}" data-step="-1"><span class="track-dot"></span><div>${name}<small data-sound="${track}"></small></div></div>
    <button type="button" class="mute" aria-label="Mute ${name}" data-mute="${track}">M</button>
  </div>
  ${Array.from({length:16}, (_, step) => `<button type="button" class="step ${step % 4 === 0 ? 'beat' : ''}" style="--track-color:${colors[track]}" aria-label="${name}, step ${step + 1}" aria-keyshortcuts="Shift+Enter" title="Shift+Enter to move an active step" data-track="${track}" data-step="${step}"></button>`).join('')}
`).join('')}`

const stepButtons = [...grid.querySelectorAll<HTMLButtonElement>('.step')]
const trackLabels = [...grid.querySelectorAll<HTMLElement>('.track-name')]
const columns = [...grid.querySelectorAll<HTMLElement>('.step-number')]
let context: AudioContext | undefined
let previewSource: AudioBufferSourceNode | undefined
let persist = Promise.resolve()
let loading = true
let inputBusy = false
let recording: MediaRecorder | undefined
let recordingTimer: ReturnType<typeof setTimeout> | undefined
let wavePeaks: number[] = []
let statusVersion = 0

function status(message: string) {
  statusVersion++
  get('status').textContent = message
}

function persistSession() {
  const version = ++statusVersion
  // Snapshot mutable controls immediately. PCM arrays are immutable after creation.
  const snapshot = {
    ...session,
    bars: session.bars?.map(bar => [...bar]),
    slices: session.slices.map(slice => ({ ...slice })),
    tracks: session.tracks.map(track => ({ ...track, steps: [...track.steps] })),
  }
  persist = persist.then(() => save(snapshot)).then(() => {
    if (version === statusVersion && !recording) status('Saved locally')
  }, () => {
    status('Could not save this session')
  })
}

function updateGrid() {
  for (const button of stepButtons) {
    const track = session.tracks[Number(button.dataset.track)]
    const active = track.steps[Number(button.dataset.step)]
    button.classList.toggle('active', active)
    button.classList.toggle('muted', track.muted)
    button.setAttribute('aria-pressed', String(active))
  }
  names.forEach((name, index) => {
    const mute = grid.querySelector<HTMLButtonElement>(`[data-mute="${index}"]`)!
    mute.setAttribute('aria-pressed', String(session.tracks[index].muted))
    mute.title = `${session.tracks[index].muted ? 'Unmute' : 'Mute'} ${name}`
    trackLabels[index].querySelector('small')!.textContent = session.tracks[index].sample ? 'Sample' : 'Built-in'
  })
}

function selectedSlice(): Slice | undefined {
  return session.slices[session.selected]
}

function calculatePeaks(clip: Clip) {
  const frames = clip.channels[0].length
  const bins = Math.min(frames, 1800)
  wavePeaks = Array.from({ length: bins }, (_, index) => {
    let peak = 0
    const end = Math.floor((index + 1) * frames / bins)
    for (const channel of clip.channels) {
      for (let frame = Math.floor(index * frames / bins); frame < end; frame++) peak = Math.max(peak, Math.abs(channel[frame]))
    }
    return peak
  })
}

function drawWave() {
  const width = wave.clientWidth
  const height = wave.clientHeight
  const ratio = devicePixelRatio || 1
  const selection = selectedSlice()
  if (session.recording && selection) {
    overlay.classList.toggle('narrow', (selection.end - selection.start) / duration(session.recording) * width < 44)
  }
  canvas.width = Math.max(1, Math.round(width * ratio))
  canvas.height = Math.max(1, Math.round(height * ratio))
  const ctx = canvas.getContext('2d')!
  ctx.scale(ratio, ratio)
  ctx.strokeStyle = '#242a37'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let tick = 0; tick <= 16; tick++) {
    const x = Math.round(width * tick / 16) + .5
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
  }
  ctx.moveTo(0, height / 2 + .5)
  ctx.lineTo(width, height / 2 + .5)
  ctx.stroke()
  const clip = session.recording
  if (!clip) return
  const total = duration(clip)
  const slice = selectedSlice()
  for (let x = 0; x < width; x += 2) {
    const peak = wavePeaks[Math.floor(x / width * wavePeaks.length)] ?? 0
    const amplitude = Math.max(1, Math.sqrt(peak) * height * .46)
    const time = x / width * total
    ctx.fillStyle = slice && time >= slice.start && time <= slice.end ? '#9de7c5' : '#546d6b'
    ctx.fillRect(x, height / 2 - amplitude, 1, amplitude * 2)
  }
  ctx.fillStyle = '#86b4a6'
  for (const item of session.slices) ctx.fillRect(item.start / total * width, 0, 1, 9)
}

function updateTrim() {
  const clip = session.recording
  const slice = selectedSlice()
  overlay.hidden = !clip || !slice
  if (clip && slice) {
    const length = duration(clip)
    startInput.value = slice.start.toFixed(3)
    endInput.value = slice.end.toFixed(3)
    startInput.max = String(length)
    endInput.max = String(length)
    overlay.style.left = `${slice.start / length * 100}%`
    overlay.style.right = `${(1 - slice.end / length) * 100}%`
  }
  drawWave()
}

function updateEditor() {
  const clip = session.recording
  get('empty').hidden = !!clip
  get('filename').textContent = clip ? `${session.name} · ${duration(clip).toFixed(2)} s` : 'No recording loaded'
  const total = clip ? duration(clip) : 4
  get('ruler').innerHTML = Array.from({length:5}, (_, index) => `<span>${(total * index / 4).toFixed(2)} s</span>`).join('')
  sliceList.innerHTML = session.slices.map((_, index) =>
    `<button type="button" class="slice" data-slice="${index}" aria-pressed="${index === session.selected}"><span aria-hidden="true">⠿</span> Slice ${String(index + 1).padStart(2, '0')}</button>`).join('')
  if (!session.slices.length) sliceList.textContent = 'Slices'
  for (const control of [startInput, endInput, get('preview'), get('assign')]) control.disabled = !clip
  updateTrim()
}

function selectSlice(index: number) {
  session.selected = index
  for (const button of sliceList.querySelectorAll<HTMLButtonElement>('button')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.slice) === index))
  }
  updateTrim()
  persistSession()
}

function changeTrim(edge: keyof Slice, time: number) {
  const clip = session.recording
  const slice = selectedSlice()
  if (!clip || !slice || !Number.isFinite(time)) return
  const length = duration(clip)
  const gap = Math.min(.01, length)
  slice[edge] = edge === 'start'
    ? Math.max(0, Math.min(time, slice.end - gap))
    : Math.min(length, Math.max(time, slice.start + gap))
}

function markInputBusy(busy: boolean) {
  inputBusy = busy
  get('record').disabled = busy
  get('import').disabled = busy
}

function useClip(clip: Clip, name: string) {
  if (!clip.channels[0].length) throw new Error('Empty audio')
  session.recording = clip
  session.name = name
  session.slices = detectSlices(clip)
  session.selected = 0
  calculatePeaks(clip)
  updateEditor()
  persistSession()
}

async function audioContext() {
  context ??= new AudioContext()
  await context.resume()
  return context
}

get('import').onclick = () => fileInput.click()
fileInput.onchange = async () => {
  const file = fileInput.files?.[0]
  fileInput.value = ''
  if (!file || inputBusy || recording || loading) return
  markInputBusy(true)
  try {
    const audio = await audioContext()
    useClip(fromBuffer(await audio.decodeAudioData(await file.arrayBuffer())), file.name)
  } catch {
    status('Could not read that audio file')
  } finally {
    markInputBusy(false)
  }
}

get('record').onclick = async () => {
  if (recording) {
    if (recording.state === 'recording') recording.stop()
    return
  }
  if (inputBusy || loading) return
  let stream: MediaStream | undefined
  markInputBusy(true)
  try {
    const audio = await audioContext()
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mic = stream
    const recorder = new MediaRecorder(mic)
    const parts: Blob[] = []
    recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data) }
    recorder.onerror = () => status('Microphone recording failed')
    recorder.onstop = async () => {
      clearTimeout(recordingTimer)
      mic.getTracks().forEach(track => track.stop())
      recording = undefined
      get('record-label').textContent = 'Record'
      get('record').classList.remove('recording')
      markInputBusy(true)
      try {
        const buffer = fromBuffer(await audio.decodeAudioData(await new Blob(parts, {type: recorder.mimeType}).arrayBuffer()))
        useClip(trim(buffer, {start: 0, end: Math.min(16, duration(buffer))}), 'Microphone recording')
      } catch {
        status('Could not read the microphone recording')
      } finally {
        markInputBusy(false)
      }
    }
    recorder.start()
    recording = recorder
    recordingTimer = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, 16000)
    get('record').disabled = false
    get('record-label').textContent = 'Stop recording'
    get('record').classList.add('recording')
    status('Recording · 16 s maximum')
  } catch {
    stream?.getTracks().forEach(track => track.stop())
    markInputBusy(false)
    status('Could not access the microphone')
  }
}

get('preview').onclick = async () => {
  const clip = session.recording
  const slice = selectedSlice()
  if (!clip || !slice) return
  try {
    const audio = await audioContext()
    previewSource?.stop()
    const source = playClip(audio, trim(clip, slice), audio.currentTime, .75)
    previewSource = source
    source.addEventListener('ended', () => { if (previewSource === source) previewSource = undefined })
  } catch {
    status('Could not preview the slice')
  }
}

function assignSlice(index: number, track: number, step: number) {
  const clip = session.recording
  const slice = session.slices[index]
  if (!clip || !slice) return
  session.tracks[track].sample = trim(clip, slice)
  if (step >= 0) session.tracks[track].steps[step] = true
  updateGrid()
  persistSession()
}

type Hit = { track: number; step: number }
let movingHit: Hit | undefined
const destinationTrack = get<HTMLSelectElement>('assign-track')
const destinationStep = get<HTMLSelectElement>('assign-step')

function openDestination(hit?: Hit) {
  movingHit = hit
  get('assign-title').textContent = hit ? 'Move Hit' : 'Assign Slice'
  get('destination-confirm').textContent = hit ? 'Move' : 'Assign'
  destinationStep.options[0].textContent = hit ? 'Keep step timing' : 'Track sound'
  destinationTrack.selectedIndex = hit?.track ?? 0
  destinationStep.selectedIndex = 0
  dialog.returnValue = ''
  dialog.showModal()
}

function moveHit(from: Hit, to: Hit) {
  const source = session.tracks[from.track].steps
  const target = session.tracks[to.track].steps
  const step = to.step < 0 ? from.step : to.step
  if (source === target && from.step === step) return
  if (!source[from.step]) return
  if (target[step]) {
    status('That step already has a hit')
    return
  }
  source[from.step] = false
  target[step] = true
  updateGrid()
  persistSession()
}

get('assign').onclick = () => openDestination()
dialog.addEventListener('close', () => {
  if (dialog.returnValue !== 'assign') return
  const to = { track: Number(destinationTrack.value), step: Number(destinationStep.value) }
  if (movingHit) {
    moveHit(movingHit, to)
  } else {
    assignSlice(session.selected, to.track, to.step)
  }
})

grid.addEventListener('keydown', event => {
  if (loading || event.key !== 'Enter' || !event.shiftKey) return
  const button = (event.target as HTMLElement).closest<HTMLElement>('.step.active')
  if (!button) return
  event.preventDefault()
  openDestination({ track: Number(button.dataset.track), step: Number(button.dataset.step) })
})

for (const [edge, input] of [['start', startInput], ['end', endInput]] as const) {
  input.onchange = () => {
    changeTrim(edge, input.valueAsNumber)
    updateTrim()
    persistSession()
  }
  const handle = get(`trim-${edge}`)
  handle.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    changeTrim(edge, selectedSlice()![edge] + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? .1 : .01))
    updateTrim()
    persistSession()
  }
  handle.onpointerdown = event => {
    if (event.button !== 0) return
    event.stopPropagation()
    handle.setPointerCapture(event.pointerId)
    const original = selectedSlice()![edge]
    const originX = event.clientX
    const rect = wave.getBoundingClientRect()
    handle.onpointermove = move => {
      const total = duration(session.recording!)
      changeTrim(edge, original + (move.clientX - originX) / rect.width * total)
      updateTrim()
    }
    const finish = () => {
      handle.onpointermove = null
      handle.onlostpointercapture = null
      persistSession()
    }
    handle.onlostpointercapture = finish
  }
}
wave.onclick = event => {
  if (event.target !== canvas || !session.recording) return
  const time = event.offsetX / wave.clientWidth * duration(session.recording)
  const index = session.slices.findLastIndex(slice => time >= slice.start && time <= slice.end)
  if (index >= 0) selectSlice(index)
}
new ResizeObserver(drawWave).observe(wave)

studio.addEventListener('click', event => {
  if (loading) return
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!button) return
  if (button.dataset.slice !== undefined) {
    selectSlice(Number(button.dataset.slice))
  } else if (button.classList.contains('step')) {
    const track = session.tracks[Number(button.dataset.track)]
    const step = Number(button.dataset.step)
    track.steps[step] = !track.steps[step]
    updateGrid()
    persistSession()
  } else if (button.dataset.mute !== undefined) {
    const track = session.tracks[Number(button.dataset.mute)]
    track.muted = !track.muted
    if (context) applyMix(context, session)
    refreshMixer()
    updateGrid()
    persistSession()
  }
})

type DragSource = { slice: number } | Hit
let suppressClick = false
studio.addEventListener('click', event => {
  if (!suppressClick || event.detail === 0) return
  suppressClick = false
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)

studio.addEventListener('pointerdown', event => {
  if (loading || !event.isPrimary || event.button !== 0) return
  suppressClick = false
  const source = (event.target as HTMLElement).closest<HTMLElement>('.slice, .step.active')
  if (!source) return
  const item: DragSource = source.dataset.slice !== undefined
    ? { slice: Number(source.dataset.slice) }
    : { track: Number(source.dataset.track), step: Number(source.dataset.step) }
  let dragging = false
  let hover: HTMLElement | undefined
  let scrollFrame = 0
  let pointer = event
  const targets = [...trackLabels, ...stepButtons]
  const validTarget = (target: HTMLElement) => {
    if ('slice' in item) return true
    const track = Number(target.dataset.track)
    const step = Number(target.dataset.step) < 0 ? item.step : Number(target.dataset.step)
    return !session.tracks[track].steps[step]
  }
  const updateHover = () => {
    hover?.classList.remove('drop-hover')
    const candidate = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest<HTMLElement>('[data-track][data-step]')
    hover = candidate && validTarget(candidate) ? candidate : undefined
    hover?.classList.add('drop-hover')
  }
  const scrollGrid = () => {
    const bounds = gridScroll.getBoundingClientRect()
    if (pointer.clientY >= bounds.top && pointer.clientY <= bounds.bottom &&
        pointer.clientX >= bounds.left && pointer.clientX <= bounds.right) {
      const edge = 35
      const offset = pointer.clientX < bounds.left + edge ? -7 : pointer.clientX > bounds.right - edge ? 7 : 0
      if (offset) {
        gridScroll.scrollLeft += offset
        updateHover()
      }
    }
    scrollFrame = requestAnimationFrame(scrollGrid)
  }
  source.setPointerCapture(event.pointerId)
  const move = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return
    if (!dragging && Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) < 7) return
    pointer = next
    if (!dragging) {
      dragging = true
      scrollFrame = requestAnimationFrame(scrollGrid)
      ghost.hidden = false
      ghost.textContent = 'slice' in item ? `Slice ${String(item.slice + 1).padStart(2, '0')}` : `${names[item.track]} · ${item.step + 1}`
      for (const target of targets) target.classList.toggle('drop-valid', validTarget(target))
    }
    ghost.style.transform = `translate(${next.clientX + 12}px, ${next.clientY + 12}px)`
    updateHover()
  }
  const finish = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return
    source.removeEventListener('pointermove', move)
    source.removeEventListener('pointerup', finish)
    source.removeEventListener('lostpointercapture', finish)
    if (!dragging) return
    if (next.type === 'pointerup') move(next)
    cancelAnimationFrame(scrollFrame)
    suppressClick = true
    ghost.hidden = true
    for (const target of targets) target.classList.remove('drop-valid', 'drop-hover')
    if (!hover || next.type !== 'pointerup') return
    const track = Number(hover.dataset.track)
    const step = Number(hover.dataset.step)
    if ('slice' in item) {
      assignSlice(item.slice, track, step)
    } else {
      moveHit(item, { track, step })
    }
  }
  source.addEventListener('pointermove', move)
  source.addEventListener('pointerup', finish)
  source.addEventListener('lostpointercapture', finish)
})

let timer: ReturnType<typeof setInterval> | undefined
let generation = 0
let frame = 0
let nextStep = 0
let nextTime = 0
let visibleStep = -1
const queue: Array<{ when: number; step: number }> = []
const sources = new Set<AudioBufferSourceNode>()

function updateSongLength() {
  const bars = session.bars
  const count = bars?.length || 1
  const selected = Math.min(Number(editBar.value), count - 1)
  const lastPopulated = bars?.findLastIndex(notes => notes.length > 0) ?? -1
  songLength.value = String(count)
  for (const option of songLength.options) option.disabled = Number(option.value) <= lastPopulated
  if (editBar.options.length !== count) {
    editBar.innerHTML = Array.from({ length: count }, (_, index) => `<option value="${index}">${index + 1}</option>`).join('')
  }
  editBar.value = String(selected)
}

function paintRoll() {
  const bar = session.bars?.[Number(editBar.value)] ?? []
  const notes = bar.filter(note => note.instrument === instrumentInput.value)
  for (const cell of pianoRoll.querySelectorAll<HTMLButtonElement>('[data-pitch]')) {
    const pitch = Number(cell.dataset.pitch)
    const beat = Number(cell.dataset.beat)
    const note = notes.find(note => note.pitch === pitch && note.step === beat)
    const held = notes.some(note => note.pitch === pitch && note.step < beat && note.step + note.length > beat)
    cell.textContent = note && note.length > 1 ? String(note.length) : ''
    cell.setAttribute('aria-pressed', String(!!note))
    cell.classList.toggle('held', held)
  }
  paintRollPlayhead()
}

function paintRollPlayhead() {
  const bar = Math.floor(visibleStep / 16)
  const step = bar === Number(editBar.value) ? visibleStep % 16 : -1
  pianoRoll.querySelectorAll('.current').forEach(cell => cell.classList.remove('current'))
  if (step >= 0) {
    pianoRoll.querySelectorAll(`[data-beat="${step}"], [data-roll-column="${step}"]`)
      .forEach(cell => cell.classList.add('current'))
  }
  const playingBar = get('playing-bar')
  playingBar.hidden = visibleStep < 0
  const label = `Playing bar ${bar + 1}`
  if (visibleStep >= 0 && playingBar.textContent !== label) playingBar.textContent = label
}

function renderRoll() {
  const octave = Number(octaveInput.value)
  const root = (octave + 1) * 12
  pianoRoll.innerHTML = `<div class="grid-corner">Note</div>${Array.from({ length: 16 }, (_, index) =>
    `<div class="step-number ${index % 4 === 0 ? 'beat' : ''}" data-roll-column="${index}">${index + 1}</div>`).join('')}
    ${pitches.map((_, index) => {
      const offset = 11 - index
      const name = pitches[offset] + octave
      return `<div class="pitch-key ${name.includes('♯') ? 'accidental' : ''}">${name}</div>
        ${Array.from({ length: 16 }, (_, beat) =>
          `<button class="note-cell ${beat % 4 === 0 ? 'downbeat' : ''}" type="button"
            data-pitch="${root + offset}" data-beat="${beat}" tabindex="${index === 0 && beat === 0 ? 0 : -1}"
            aria-label="${name}, step ${beat + 1}"></button>`).join('')}`
    }).join('')}`
  paintRoll()
}

songLength.onchange = () => {
  if (loading) return
  const count = Number(songLength.value)
  const bars = session.bars ??= [[]]
  if (bars.slice(count).some(bar => bar.length)) return updateSongLength()
  stopPlayback()
  session.bars = Array.from({ length: count }, (_, index) => bars[index] ?? [])
  updateSongLength()
  paintRoll()
  persistSession()
}
editBar.onchange = paintRoll
instrumentInput.onchange = paintRoll
octaveInput.onchange = renderRoll

pianoRoll.onclick = event => {
  const cell = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-pitch]')
  if (!cell || loading) return
  const instrument = instrumentInput.value as Instrument
  const bar = (session.bars ??= [[]])[Number(editBar.value)]
  const pitch = Number(cell.dataset.pitch)
  const step = Number(cell.dataset.beat)
  const existing = bar.findIndex(note => note.instrument === instrument && note.pitch === pitch && note.step === step)
  if (existing >= 0) {
    bar.splice(existing, 1)
  } else {
    const length = Math.min(Number(noteLength.value), 16 - step)
    bar.push({ instrument, pitch, step, length })
    if (visibleStep < 0) {
      void audioContext().then(audio => {
        playClip(audio, instrumentClip(instrument, pitch, length * stepLength(session.bpm)), audio.currentTime, .24)
      }).catch(() => status('Could not preview the note'))
    }
  }
  updateSongLength()
  paintRoll()
  persistSession()
}

pianoRoll.addEventListener('focusin', event => {
  const cell = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-pitch]')
  if (!cell) return
  pianoRoll.querySelector<HTMLButtonElement>('[tabindex="0"]')!.tabIndex = -1
  cell.tabIndex = 0
})

pianoRoll.onkeydown = event => {
  const cell = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-pitch]')
  if (!cell) return
  const direction = [
    ['ArrowLeft', 0, -1], ['ArrowRight', 0, 1], ['ArrowUp', 1, 0], ['ArrowDown', -1, 0],
  ] as const
  const move = direction.find(([key]) => key === event.key)
  if (!move) return
  event.preventDefault()
  pianoRoll.querySelector<HTMLButtonElement>(
    `[data-pitch="${Number(cell.dataset.pitch) + move[1]}"][data-beat="${Number(cell.dataset.beat) + move[2]}"]`,
  )?.focus()
}

function highlight(step: number) {
  if (step === visibleStep) return
  visibleStep = step
  columns.forEach((column, index) => column.classList.toggle('current', index === step % 16))
  stepButtons.forEach((button, index) => button.classList.toggle('current', index % 16 === step % 16))
  paintRollPlayhead()
}

function schedule(audio: AudioContext) {
  if (nextTime < audio.currentTime - .25) nextTime = audio.currentTime + .02
  while (nextTime < audio.currentTime + .09) {
    for (const source of playStep(audio, session, nextStep, nextTime)) {
      sources.add(source)
      source.addEventListener('ended', () => sources.delete(source))
    }
    queue.push({ when: nextTime, step: nextStep })
    nextStep = (nextStep + 1) % songSteps(session)
    nextTime += stepLength(session.bpm)
  }
  while (queue.length > 1 && queue[1].when < audio.currentTime - .25) queue.shift()
}

function stopPlayback() {
  generation++
  clearInterval(timer)
  timer = undefined
  cancelAnimationFrame(frame)
  for (const source of sources) source.stop()
  sources.clear()
  queue.length = 0
  highlight(-1)
  setPlaying(false)
}

function setPlaying(playing: boolean) {
  for (const id of ['play', 'roll-play']) {
    const button = get(id)
    button.textContent = playing ? '■ Stop' : '▶ Play'
    button.setAttribute('aria-pressed', String(playing))
  }
}

async function togglePlayback() {
  if (loading) return
  const button = get('play')
  if (button.getAttribute('aria-pressed') === 'true') return stopPlayback()
  const current = ++generation
  setPlaying(true)
  try {
    const audio = await audioContext()
    if (current !== generation) return
    applyMix(audio, session)
    nextStep = 0
    nextTime = audio.currentTime + .04
    schedule(audio)
    timer = setInterval(() => schedule(audio), 24)
    const paint = () => {
      while (queue[0]?.when <= audio.currentTime) highlight(queue.shift()!.step)
      frame = requestAnimationFrame(paint)
    }
    frame = requestAnimationFrame(paint)
  } catch {
    if (current !== generation) return
    stopPlayback()
    status('Could not start playback')
  }
}
get('play').onclick = togglePlayback
get('roll-play').onclick = togglePlayback

function readMix(): Mix {
  const mix = { ...session.mix }
  drumChannels.forEach((channel, index) => {
    const settings = mix[channel]
    mix[channel] = { level: settings?.level ?? 1, pan: settings?.pan ?? 0, muted: session.tracks[index].muted }
  })
  return mix
}

const refreshMixer = mountMixer(get('mixer'), readMix, mix => {
  if (loading) return
  session.mix = mix
  drumChannels.forEach((channel, index) => {
    session.tracks[index].muted = mix[channel]?.muted ?? false
  })
  if (context) applyMix(context, session)
  updateGrid()
  persistSession()
})

const starterDialog = get<HTMLDialogElement>('starter-dialog')
const starterSelect = get<HTMLSelectElement>('starter-select')
presets.forEach((preset, index) => starterSelect.add(new Option(preset.name, String(index))))
get('starter-open').onclick = () => {
  if (loading) return
  starterDialog.returnValue = ''
  starterDialog.showModal()
}
starterDialog.addEventListener('close', () => {
  if (starterDialog.returnValue !== 'load') return
  const preset = presets[Number(starterSelect.value)]
  if (!preset) return
  stopPlayback()
  session.bpm = preset.bpm
  session.tracks.forEach((track, index) => {
    track.steps = Array.from({ length: 16 }, (_, step) => preset.drums[index].includes(step))
  })
  session.bars = preset.bars.map(bar => bar.map(note => ({ ...note })))
  editBar.value = '0'
  bpmInput.value = String(session.bpm)
  updateGrid()
  updateSongLength()
  paintRoll()
  persistSession()
})

bpmInput.onchange = () => {
  if (loading) return
  session.bpm = Number.isFinite(bpmInput.valueAsNumber) ? Math.max(30, Math.min(300, Math.round(bpmInput.valueAsNumber))) : session.bpm
  bpmInput.value = String(session.bpm)
  persistSession()
}

get('clear').onclick = () => {
  if (loading) return
  session.tracks.forEach(track => track.steps.fill(false))
  updateGrid()
  persistSession()
}

get('export').onclick = async () => {
  if (loading) return
  const button = get('export')
  button.disabled = true
  try {
    const bpm = session.bpm
    const url = URL.createObjectURL(await exportWav(session))
    const link = document.createElement('a')
    link.href = url
    link.download = `lets-cook-a-music-${bpm}bpm.wav`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    status('WAV exported')
  } catch {
    status('Could not export WAV')
  } finally {
    button.disabled = false
  }
}

updateGrid()
updateEditor()
renderRoll()
load().then(saved => {
  if (saved) session = saved
  if (session.recording) calculatePeaks(session.recording)
  bpmInput.value = String(session.bpm)
  updateGrid()
  updateEditor()
  updateSongLength()
  paintRoll()
  refreshMixer()
  status(saved ? 'Session restored' : 'Ready')
}).catch(() => status('Local storage unavailable')).finally(() => { loading = false })
