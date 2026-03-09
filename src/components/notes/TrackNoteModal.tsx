import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react'


type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type NoteTab = 'note' | 'images' | 'voice'

type TrackNoteModalProps = {
  trackId: string
  trackTitle: string
  onClose: () => void
  onSaved: (preview: string) => void
}

function parseNoteHtml(contentJson: string): string {
  try {
    const parsed = JSON.parse(contentJson) as { html?: string }
    return typeof parsed.html === 'string' ? parsed.html : ''
  } catch {
    return ''
  }
}

function derivePreviewFromHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

const TEXT_COLORS = ['#e7ebff', '#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#818cf8', '#f472b6']

export function TrackNoteModal({ trackId, trackTitle, onClose, onSaved }: TrackNoteModalProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  const [note, setNote] = useState<TrackNote | null>(null)
  const [htmlContent, setHtmlContent] = useState('')
  const [lastSavedHtml, setLastSavedHtml] = useState('')
  const [media, setMedia] = useState<NoteMedia[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [statusMessage, setStatusMessage] = useState('Saved')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [editingAudioId, setEditingAudioId] = useState<string | null>(null)
  const [editingAudioName, setEditingAudioName] = useState('')
  const [activeTab, setActiveTab] = useState<NoteTab>('note')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const imageItems = useMemo(() => media.filter((item) => item.type === 'image'), [media])
  const audioItems = useMemo(() => media.filter((item) => item.type === 'audio'), [media])

  useEffect(() => {
    let disposed = false
    const load = async () => {
      try {
        const existing = await window.notes.getByTrackId(trackId)
        const result = existing ?? (await window.notes.createForTrack(trackId))
        if (!result || disposed) return
        setNote(result.note)
        const html = parseNoteHtml(result.note.contentJson)
        setHtmlContent(html)
        setLastSavedHtml(html)
        setMedia(result.media)
      } catch {
        if (disposed) return
        setSaveState('error')
        setStatusMessage('Failed to load note.')
      }
    }
    void load()
    return () => {
      disposed = true
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [trackId])

  useEffect(() => {
    if (!editorRef.current) return
    if (editorRef.current.innerHTML !== htmlContent) {
      editorRef.current.innerHTML = htmlContent
    }
  }, [htmlContent])

  useEffect(() => {
    if (!note) return
    if (htmlContent === lastSavedHtml) return
    setSaveState('saving')
    setStatusMessage('Saving...')
    const timeout = window.setTimeout(async () => {
      try {
        const contentJson = JSON.stringify({ type: 'doc', version: 1, html: htmlContent })
        const updated = await window.notes.updateContent({ trackId, contentJson })
        if (!updated) {
          setSaveState('error')
          setStatusMessage('Failed to save')
          return
        }
        setNote(updated)
        const normalizedHtml = parseNoteHtml(updated.contentJson)
        setLastSavedHtml(normalizedHtml)
        onSaved(derivePreviewFromHtml(normalizedHtml))
        setSaveState('saved')
        setStatusMessage('Saved')
      } catch {
        setSaveState('error')
        setStatusMessage('Failed to save')
      }
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [htmlContent, lastSavedHtml, note, onSaved, trackId])

  const applyFormat = (command: string, value?: string) => {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand(command, false, value)
    setHtmlContent(editorRef.current.innerHTML)
  }

  const handleEditorKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    // Cmd+Shift+7 → Ordered list
    if (e.shiftKey && e.key === '7') { e.preventDefault(); applyFormat('insertOrderedList'); return }
    // Cmd+Shift+8 → Bullet list
    if (e.shiftKey && e.key === '8') { e.preventDefault(); applyFormat('insertUnorderedList'); return }
    // Cmd+Shift+S → Strikethrough
    if (e.shiftKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); applyFormat('strikeThrough'); return }
    // Cmd+Shift+9 → Blockquote
    if (e.shiftKey && e.key === '9') { e.preventDefault(); applyFormat('formatBlock', 'BLOCKQUOTE'); return }
    // Cmd+Alt+1/2/3 → Headings
    if (e.altKey && e.key === '1') { e.preventDefault(); applyFormat('formatBlock', 'H1'); return }
    if (e.altKey && e.key === '2') { e.preventDefault(); applyFormat('formatBlock', 'H2'); return }
    if (e.altKey && e.key === '3') { e.preventDefault(); applyFormat('formatBlock', 'H3'); return }
    // Cmd+E → clear formatting (match Notion)
    if (!e.shiftKey && !e.altKey && e.key === 'e') { e.preventDefault(); applyFormat('removeFormat'); return }
  }

  const handleAttachFile = async (file: File) => {
    if (!note) return
    try {
      setSaveState('saving')
      setStatusMessage('Uploading...')
      const buffer = await file.arrayBuffer()
      const response = await window.notes.attachImage({
        noteId: note.id,
        trackId,
        originalName: file.name,
        mimeType: file.type,
        bytes: new Uint8Array(buffer),
      })
      if (!response.ok || !response.media) {
        setSaveState('error')
        setStatusMessage(response.error ?? 'Failed to attach image.')
        return
      }
      setMedia((prev) => [response.media as NoteMedia, ...prev])
      setSaveState('saved')
      setStatusMessage('Saved')
    } catch {
      setSaveState('error')
      setStatusMessage('Failed to attach image.')
    }
  }

  const handleAttachImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await handleAttachFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => setIsDragOver(false)

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return
    if (activeTab === 'note') setActiveTab('images')
    await handleAttachFile(file)
  }

  const handleDeleteMedia = async (mediaId: string) => {
    try {
      const response = await window.notes.deleteMedia(mediaId)
      if (!response.ok) return
      setMedia((prev) => prev.filter((item) => item.id !== mediaId))
    } catch {
      // ignore
    }
  }

  const beginRenameAudio = (item: NoteMedia) => {
    setEditingAudioId(item.id)
    setEditingAudioName(item.originalName)
  }

  const cancelRenameAudio = () => {
    setEditingAudioId(null)
    setEditingAudioName('')
  }

  const commitRenameAudio = async () => {
    if (!editingAudioId) return
    const nextName = editingAudioName.trim()
    if (!nextName) {
      setStatusMessage('Recording name cannot be empty.')
      setSaveState('error')
      return
    }
    try {
      const response = await window.notes.renameMedia({
        mediaId: editingAudioId,
        originalName: nextName,
      })
      if (!response.ok || !response.media) {
        setSaveState('error')
        setStatusMessage(response.error ?? 'Failed to rename recording.')
        return
      }
      setMedia((prev) => prev.map((item) => (item.id === response.media!.id ? response.media! : item)))
      setSaveState('saved')
      setStatusMessage('Saved')
      cancelRenameAudio()
    } catch {
      setSaveState('error')
      setStatusMessage('Failed to rename recording.')
    }
  }

  const startRecording = async () => {
    setRecordingError(null)
    if (!note) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
          const buffer = await blob.arrayBuffer()
          const response = await window.notes.saveVoiceRecording({
            noteId: note.id,
            trackId,
            originalName: `recording-${Date.now()}.webm`,
            mimeType: recorder.mimeType || 'audio/webm',
            bytes: new Uint8Array(buffer),
          })
          if (response.ok && response.media) {
            setMedia((prev) => [response.media as NoteMedia, ...prev])
            setSaveState('saved')
            setStatusMessage('Saved')
          } else {
            setSaveState('error')
            setStatusMessage(response.error ?? 'Failed to save recording.')
          }
        } catch {
          setSaveState('error')
          setStatusMessage('Failed to save recording.')
        } finally {
          mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
          mediaStreamRef.current = null
          mediaRecorderRef.current = null
          setIsRecording(false)
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
      setStatusMessage('Recording...')
    } catch {
      setRecordingError('Microphone permission denied or unavailable.')
      setIsRecording(false)
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  const closeWithFlush = async () => {
    if (note && htmlContent !== lastSavedHtml) {
      try {
        const contentJson = JSON.stringify({ type: 'doc', version: 1, html: htmlContent })
        const updated = await window.notes.updateContent({ trackId, contentJson })
        if (updated) {
          const normalizedHtml = parseNoteHtml(updated.contentJson)
          onSaved(derivePreviewFromHtml(normalizedHtml))
        }
      } catch {
        // ignore
      }
    }
    onClose()
  }

  const saveClass = saveState === 'error' ? 'error' : saveState === 'saving' ? 'saving' : 'saved'

  return (
    <div className="modal-backdrop" onClick={() => void closeWithFlush()}>
      <div className="notion-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="notion-header">
          <div className="notion-header-left">
            <span className="notion-eyebrow">Track Note</span>
            <h2 className="notion-page-title">{trackTitle}</h2>
          </div>
          <div className="notion-header-right">
            <span className={`note-save-status ${saveClass}`}>{statusMessage}</span>
            <button type="button" className="notion-close-btn" onClick={() => void closeWithFlush()}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="notion-tab-row">
          <button
            type="button"
            className={`notion-tab ${activeTab === 'note' ? 'active' : ''}`}
            onClick={() => setActiveTab('note')}
          >
            Note
          </button>
          <button
            type="button"
            className={`notion-tab ${activeTab === 'images' ? 'active' : ''}`}
            onClick={() => setActiveTab('images')}
          >
            Images{imageItems.length > 0 ? ` (${imageItems.length})` : ''}
          </button>
          <button
            type="button"
            className={`notion-tab ${activeTab === 'voice' ? 'active' : ''}`}
            onClick={() => setActiveTab('voice')}
          >
            Voice{audioItems.length > 0 ? ` (${audioItems.length})` : ''}
          </button>
        </div>

        {/* ── Note Tab ── */}
        {activeTab === 'note' && (
          <>
            <div className="notion-toolbar">
              <div className="notion-toolbar-group">
                <button type="button" title="Bold (⌘B)" className="notion-tool-btn" onClick={() => applyFormat('bold')}><b>B</b></button>
                <button type="button" title="Italic (⌘I)" className="notion-tool-btn" onClick={() => applyFormat('italic')}><i>I</i></button>
                <button type="button" title="Underline (⌘U)" className="notion-tool-btn" onClick={() => applyFormat('underline')}><u>U</u></button>
                <button type="button" title="Strikethrough (⌘⇧S)" className="notion-tool-btn" onClick={() => applyFormat('strikeThrough')}><s>S</s></button>
              </div>
              <div className="notion-toolbar-sep" />
              <div className="notion-toolbar-group">
                <button type="button" title="Heading 1 (⌘⌥1)" className="notion-tool-btn" onClick={() => applyFormat('formatBlock', 'H1')}>H1</button>
                <button type="button" title="Heading 2 (⌘⌥2)" className="notion-tool-btn" onClick={() => applyFormat('formatBlock', 'H2')}>H2</button>
                <button type="button" title="Heading 3 (⌘⌥3)" className="notion-tool-btn" onClick={() => applyFormat('formatBlock', 'H3')}>H3</button>
              </div>
              <div className="notion-toolbar-sep" />
              <div className="notion-toolbar-group">
                <button type="button" title="Bullet list (⌘⇧8)" className="notion-tool-btn" onClick={() => applyFormat('insertUnorderedList')}>• List</button>
                <button type="button" title="Numbered list (⌘⇧7)" className="notion-tool-btn" onClick={() => applyFormat('insertOrderedList')}>1. List</button>
                <button type="button" title="Blockquote (⌘⇧9)" className="notion-tool-btn" onClick={() => applyFormat('formatBlock', 'BLOCKQUOTE')}>" Quote</button>
              </div>
              <div className="notion-toolbar-sep" />
              <div className="notion-toolbar-group">
                <button type="button" title="Divider" className="notion-tool-btn" onClick={() => applyFormat('insertHorizontalRule')}>— Line</button>
                <div className="notion-color-wrap">
                  <button
                    type="button"
                    title="Text color"
                    className="notion-tool-btn"
                    onClick={() => setShowColorPicker((p) => !p)}
                  >
                    A ◐
                  </button>
                  {showColorPicker && (
                    <div className="notion-color-palette">
                      {TEXT_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="notion-color-swatch"
                          style={{ background: c }}
                          title={c}
                          onClick={() => {
                            applyFormat('foreColor', c)
                            setShowColorPicker(false)
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              className="notion-editor-wrap"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e)}
            >
              {!htmlContent && (
                <p className="notion-editor-placeholder">
                  Start writing your thoughts, ideas, or reference notes...
                </p>
              )}
              <div
                ref={editorRef}
                className={`notion-editor ${isDragOver ? 'drag-over' : ''}`}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setHtmlContent((e.currentTarget as HTMLDivElement).innerHTML)}
                onKeyDown={handleEditorKeyDown}
              />
              {isDragOver && (
                <div className="notion-drop-overlay">Drop image to attach</div>
              )}
            </div>
          </>
        )}

        {/* ── Images Tab ── */}
        {activeTab === 'images' && (
          <div className="notion-images-tab">
            <div
              className={`notion-image-drop-zone ${isDragOver ? 'active' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e)}
            >
              <span className="notion-drop-plus">+</span>
              <span>Click or drag &amp; drop to add images</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden-file-input"
              onChange={handleAttachImage}
            />
            {imageItems.length > 0 ? (
              <div className="notion-image-grid">
                {imageItems.map((item) => (
                  <div key={item.id} className="notion-image-tile">
                    <img src={window.audioApi.buildMediaUrl(item.filePath)} alt={item.originalName} />
                    <div className="notion-image-tile-overlay">
                      <span>{item.originalName}</span>
                      <button type="button" onClick={() => void handleDeleteMedia(item.id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted notion-tab-empty">No images attached yet.</p>
            )}
          </div>
        )}

        {/* ── Voice Tab ── */}
        {activeTab === 'voice' && (
          <div className="notion-voice-tab">
            <div className="notion-record-row">
              {!isRecording ? (
                <button type="button" className="notion-record-btn" onClick={() => void startRecording()}>
                  <span className="notion-record-dot" />
                  Start Recording
                </button>
              ) : (
                <button type="button" className="notion-record-btn is-recording" onClick={stopRecording}>
                  <span className="notion-record-stop" />
                  Stop Recording
                </button>
              )}
              {recordingError && <p className="error">{recordingError}</p>}
            </div>
            {audioItems.length > 0 ? (
              <div className="notion-audio-list">
                {audioItems.map((item) => (
                  <div key={item.id} className="notion-audio-row">
                    <div className="notion-audio-info">
                      {editingAudioId === item.id ? (
                        <div className="notion-audio-rename">
                          <input
                            type="text"
                            value={editingAudioName}
                            onChange={(event) => setEditingAudioName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void commitRenameAudio()
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                cancelRenameAudio()
                              }
                            }}
                            maxLength={120}
                            autoFocus
                          />
                          <button type="button" className="ghost" onClick={() => void commitRenameAudio()}>
                            Save
                          </button>
                          <button type="button" className="ghost" onClick={cancelRenameAudio}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="notion-audio-name">{item.originalName}</span>
                          <div className="notion-audio-actions">
                            <button type="button" className="ghost" onClick={() => beginRenameAudio(item)}>
                              Rename
                            </button>
                            <button type="button" className="ghost" onClick={() => void handleDeleteMedia(item.id)}>
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <audio controls src={window.audioApi.buildAudioUrl(item.filePath)} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted notion-tab-empty">No voice recordings yet. Press record to capture ideas.</p>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
