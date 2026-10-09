import { useRef, useState, useEffect, useCallback } from 'react'
import { ingestPDF, askQuestion, isDocumentLoaded } from './rag.js'

// ─── Pipeline steps shown during document processing ───────────────────────
const PIPELINE_STEPS = [
  { key: 'parse', icon: '📄', label: 'Parsing PDF' },
  { key: 'chunk', icon: '✂️', label: 'Chunking text' },
  { key: 'embed', icon: '🔢', label: 'Creating embeddings' },
  { key: 'store', icon: '🗂️', label: 'Building index' },
  { key: 'done', icon: '✅', label: 'Ready' },
]

export default function App() {
  const [docInfo, setDocInfo] = useState(null)   // { filename, pageCount, chunkCount }
  const [pipeline, setPipeline] = useState(null)   // { step, progress }
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const chatEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── PDF ingestion ──────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file || !file.name.endsWith('.pdf')) {
      setError('Please upload a PDF file.')
      return
    }
    setError(null)
    setDocInfo(null)
    setMessages([])
    setPipeline({ step: 'parse', progress: 0 })

    try {
      const info = await ingestPDF(file, (prog) => setPipeline(prog))
      setDocInfo(info)
      setMessages([{
        role: 'model',
        content: `I've read **${info.filename}** (${info.pageCount} pages, split into ${info.chunkCount} chunks). Ask me anything about it!`,
      }])
    } catch (err) {
      setError(`Failed to process PDF: ${err.message}`)
      setPipeline(null)
    }
  }, [])

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  async function handleSend() {
    const q = input.trim()
    if (!q || streaming || !isDocumentLoaded()) return

    setInput('')
    setStreaming(true)
    setError(null)

    const userMessage = { role: 'user', content: q }
    const assistantMessage = { role: 'model', content: '' }

    setMessages((prev) => [...prev, userMessage, assistantMessage])

    try {
      await askQuestion(q, messages, (chunk) => {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + chunk,
          }
          return updated
        })
      })
    } catch (err) {
      setError(`Error: ${err.message}`)
      setMessages((prev) => prev.slice(0, -1)) // remove empty assistant message
    } finally {
      setStreaming(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const currentStepIndex = pipeline
    ? PIPELINE_STEPS.findIndex((s) => s.key === pipeline.step)
    : -1

  function renderContent(text) {
    // Very simple markdown: **bold**, `code`
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="background:#0B1120;padding:1px 5px;border-radius:3px;font-family:var(--font-mono);font-size:12px">$1</code>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div style={styles.root}>
      {/* ── Left panel ── */}
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>◈</span>
          <span style={styles.logoText}>DocChat</span>
        </div>

        <p style={styles.tagline}>Upload a PDF. Ask anything.</p>

        {/* Upload zone */}
        <div
          style={{
            ...styles.dropzone,
            ...(dragOver ? styles.dropzoneActive : {}),
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {docInfo ? 'Upload new PDF' : 'Drop PDF here'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            or click to browse
          </div>
        </div>

        {/* Pipeline progress */}
        {pipeline && pipeline.step !== 'done' && (
          <div style={styles.pipelineBox}>
            <div style={styles.pipelineTitle}>Processing document</div>
            {PIPELINE_STEPS.filter(s => s.key !== 'done').map((step, i) => {
              const isActive = i === currentStepIndex
              const isDone = i < currentStepIndex
              return (
                <div key={step.key} style={styles.pipelineStep}>
                  <div style={{
                    ...styles.stepDot,
                    background: isDone ? 'var(--success)' : isActive ? 'var(--accent)' : 'var(--border)',
                    animation: isActive ? 'pulse-glow 1s ease infinite' : 'none',
                  }} />
                  <span style={{
                    color: isDone ? 'var(--success)' : isActive ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 12,
                  }}>
                    {step.icon} {step.label}
                  </span>
                </div>
              )
            })}
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${pipeline.progress}%` }} />
            </div>
          </div>
        )}

        {/* Document info */}
        {docInfo && (
          <div style={styles.docCard}>
            <div style={styles.docTitle}>{docInfo.filename}</div>
            <div style={styles.docMeta}>
              <Stat label="Pages" value={docInfo.pageCount} />
              <Stat label="Chunks" value={docInfo.chunkCount} />
            </div>
            <div style={styles.docReady}>✅ Ready to chat</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={styles.errorBox}>{error}</div>
        )}

        {/* Tip */}
        <div style={styles.tip}>
          <div style={styles.tipTitle}>How it works</div>
          <div style={styles.tipText}>
            Your PDF is split into chunks, each gets an embedding vector. When you ask a question, the most similar chunks are retrieved and sent to Gemini as context.
          </div>
        </div>
      </aside>

      {/* ── Chat panel ── */}
      <main style={styles.chat}>
        {/* Messages */}
        <div style={styles.messages}>
          {messages.length === 0 && (
            <div style={styles.empty}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>◈</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 8 }}>
                Upload a PDF to get started
              </div>
              <div style={{ color: 'var(--text-muted)' }}>
                Then ask anything — summaries, specific details, comparisons
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="message-enter" style={{
              ...styles.messageRow,
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              {msg.role === 'model' && (
                <div style={styles.avatar}>◈</div>
              )}
              <div style={{
                ...styles.bubble,
                background: msg.role === 'user' ? 'var(--user-bubble)' : 'var(--ai-bubble)',
                borderColor: msg.role === 'user' ? 'rgba(129,140,248,0.3)' : 'var(--border)',
                maxWidth: msg.role === 'user' ? '60%' : '75%',
              }}
                dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
              />
            </div>
          ))}

          {streaming && (
            <div style={{ ...styles.messageRow, justifyContent: 'flex-start' }}>
              <div style={styles.avatar}>◈</div>
              <div style={{ ...styles.bubble, background: 'var(--ai-bubble)' }}>
                <span style={styles.cursor} />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div style={styles.inputBar}>
          <textarea
            ref={textareaRef}
            style={styles.textarea}
            placeholder={docInfo ? 'Ask a question about your document…' : 'Upload a PDF first'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!docInfo || streaming}
            rows={1}
          />
          <button
            style={{
              ...styles.sendBtn,
              opacity: (!docInfo || !input.trim() || streaming) ? 0.4 : 1,
              cursor: (!docInfo || !input.trim() || streaming) ? 'not-allowed' : 'pointer',
            }}
            onClick={handleSend}
            disabled={!docInfo || !input.trim() || streaming}
          >
            {streaming ? '…' : '↑'}
          </button>
        </div>
        <div style={styles.hint}>Enter to send · Shift+Enter for new line</div>
      </main>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--accent)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = {
  root: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
  },
  sidebar: {
    width: 300,
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 20,
    overflowY: 'auto',
    flexShrink: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    fontSize: 24,
    color: 'var(--accent)',
  },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--text)',
    letterSpacing: '-0.02em',
  },
  tagline: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginTop: -8,
  },
  dropzone: {
    border: '1.5px dashed var(--border)',
    borderRadius: 10,
    padding: '24px 16px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s',
    color: 'var(--text-muted)',
  },
  dropzoneActive: {
    borderColor: 'var(--accent)',
    background: 'var(--accent-glow)',
    color: 'var(--text)',
  },
  pipelineBox: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  pipelineTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 4,
  },
  pipelineStep: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background 0.3s',
  },
  progressBar: {
    height: 3,
    background: 'var(--border)',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent)',
    borderRadius: 2,
    transition: 'width 0.4s ease',
  },
  docCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 14,
  },
  docTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--accent)',
    wordBreak: 'break-all',
    marginBottom: 12,
  },
  docMeta: {
    display: 'flex',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  docReady: {
    fontSize: 12,
    color: 'var(--success)',
    textAlign: 'center',
  },
  errorBox: {
    background: 'rgba(248,113,113,0.1)',
    border: '1px solid rgba(248,113,113,0.3)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    color: 'var(--error)',
  },
  tip: {
    marginTop: 'auto',
    padding: 14,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
  },
  tipTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 6,
  },
  tipText: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
  },
  chat: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '32px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  empty: {
    margin: 'auto',
    textAlign: 'center',
    color: 'var(--text-muted)',
  },
  messageRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent)',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    color: 'var(--accent)',
    flexShrink: 0,
  },
  bubble: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    fontSize: 14,
    lineHeight: 1.65,
    color: 'var(--text)',
  },
  cursor: {
    display: 'inline-block',
    width: 8,
    height: 14,
    background: 'var(--accent)',
    borderRadius: 1,
    animation: 'pulse-glow 0.8s ease infinite',
    verticalAlign: 'middle',
  },
  inputBar: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    padding: '12px 40px',
    borderTop: '1px solid var(--border)',
    background: 'var(--surface)',
  },
  textarea: {
    flex: 1,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text)',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    padding: '10px 14px',
    resize: 'none',
    outline: 'none',
    lineHeight: 1.5,
    maxHeight: 140,
    overflowY: 'auto',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'var(--accent-dark)',
    color: '#fff',
    border: 'none',
    fontSize: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.15s',
    flexShrink: 0,
  },
  hint: {
    textAlign: 'center',
    fontSize: 11,
    color: 'var(--text-muted)',
    paddingBottom: 10,
  },
}
