type PreviewState = {
  currentPath: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
  error: string | null
}

type PreviewListener = (state: PreviewState) => void

const DEBUG_AUDIO = import.meta.env.VITE_DEBUG_AUDIO === '1'

let audio: HTMLAudioElement | null = null
let state: PreviewState = {
  currentPath: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  error: null,
}
const listeners = new Set<PreviewListener>()
let snippetStopAt: number | null = null
let snippetListener: (() => void) | null = null

function logDebug(...args: unknown[]) {
  if (!DEBUG_AUDIO) return
  console.log('[preview]', ...args)
}

function notify() {
  for (const listener of listeners) {
    listener({ ...state })
  }
}

function setState(next: Partial<PreviewState>) {
  state = { ...state, ...next }
  notify()
}

function clearSnippetListener() {
  if (audio && snippetListener) {
    audio.removeEventListener('timeupdate', snippetListener)
  }
  snippetListener = null
  snippetStopAt = null
}

export function initPreviewPlayer() {
  if (audio) return
  audio = new Audio()
  audio.preload = 'metadata'
  audio.volume = 0.9

  audio.addEventListener('loadedmetadata', () => {
    setState({ duration: Number.isFinite(audio?.duration) ? audio?.duration ?? 0 : 0 })
  })
  audio.addEventListener('timeupdate', () => {
    setState({ currentTime: audio?.currentTime ?? 0 })
  })
  audio.addEventListener('play', () => {
    setState({ isPlaying: true, error: null })
  })
  audio.addEventListener('pause', () => {
    setState({ isPlaying: false })
    clearSnippetListener()
  })
  audio.addEventListener('ended', () => {
    setState({ isPlaying: false })
    clearSnippetListener()
  })
  audio.addEventListener('error', () => {
    const error = audio?.error?.message ?? 'Audio error'
    setState({ error, isPlaying: false })
    clearSnippetListener()
  })
}

export function subscribePreviewState(listener: PreviewListener) {
  listeners.add(listener)
  listener({ ...state })
  return () => {
    listeners.delete(listener)
  }
}

export function getPreviewState() {
  return { ...state }
}

export async function playPreview(absPath: string) {
  if (!audio) initPreviewPlayer()
  if (!audio || !window.audioApi) return
  clearSnippetListener()

  if (state.currentPath !== absPath) {
    const url = window.audioApi.buildAudioUrl(absPath)
    audio.src = url
    setState({
      currentPath: absPath,
      currentTime: 0,
      duration: 0,
      error: null,
    })
  }

  try {
    await audio.play()
    logDebug('play', absPath)
  } catch (error) {
    logDebug('play failed', error)
    setState({ error: 'Playback blocked by the browser.' })
  }
}

export function togglePreview(absPath: string) {
  if (!audio) initPreviewPlayer()
  if (!audio) return
  if (state.currentPath === absPath && state.isPlaying) {
    audio.pause()
  } else {
    void playPreview(absPath)
  }
}

export function pausePreview() {
  if (!audio) return
  audio.pause()
}

export function seekTo(seconds: number) {
  if (!audio || !Number.isFinite(seconds)) return
  const duration = audio.duration || 0
  const next = Math.max(0, Math.min(seconds, duration))
  audio.currentTime = next
  setState({ currentTime: next })
}

export async function playPreviewSnippet(
  absPath: string,
  startSeconds = 0,
  lengthSeconds = 20,
) {
  if (!audio) initPreviewPlayer()
  if (!audio) return
  await playPreview(absPath)
  const clampedStart = Math.max(0, startSeconds)
  audio.currentTime = clampedStart
  snippetStopAt = clampedStart + Math.max(1, lengthSeconds)

  const onTimeUpdate = () => {
    if (!audio || snippetStopAt === null) return
    if (audio.currentTime >= snippetStopAt) {
      audio.pause()
      clearSnippetListener()
    }
  }
  clearSnippetListener()
  snippetListener = onTimeUpdate
  audio.addEventListener('timeupdate', onTimeUpdate)
}
