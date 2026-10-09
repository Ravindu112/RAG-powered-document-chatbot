// ─── RAG Engine: TF-IDF embeddings (in-browser) + Groq generation ────────────
//
// Embeddings: TF-IDF computed directly in the browser — no CDN, no API key,
// no download, works everywhere. Good enough for a portfolio RAG demo and a
// great interview talking point vs neural embeddings.
//
// Generation: Groq (free, works worldwide, OpenAI-compatible API).

const GROQ_KEY = 
const GROQ_BASE = 
const GROQ_MODEL =
  // ─── TF-IDF Embeddings ───────────────────────────────────────────────────────
  // Global state: fitted after embedBatch() is called on the document corpus.
  let _vocab = null
let _idf = null

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2) // skip very short tokens
}

function buildVector(tokens, vocab, idf) {
  const vec = new Array(vocab.size).fill(0)
  for (const token of tokens) {
    const i = vocab.get(token)
    if (i !== undefined) vec[i]++
  }
  const len = tokens.length || 1
  // TF-IDF weighting
  const tfidf = vec.map((tf, i) => (tf / len) * idf[i])
  // L2 normalise so cosine similarity = dot product
  const norm = Math.sqrt(tfidf.reduce((s, v) => s + v * v, 0)) || 1
  return tfidf.map((v) => v / norm)
}

/**
 * Fit TF-IDF on the entire corpus and return one vector per text.
 * Must be called before embedText().
 */
export async function embedBatch(texts) {
  const docs = texts.map(tokenize)

  // Build vocabulary from all tokens across all docs
  const vocab = new Map()
  let idx = 0
  for (const doc of docs) {
    for (const token of doc) {
      if (!vocab.has(token)) vocab.set(token, idx++)
    }
  }

  // Document frequency for IDF
  const N = docs.length
  const df = new Array(vocab.size).fill(0)
  for (const doc of docs) {
    for (const token of new Set(doc)) {
      const i = vocab.get(token)
      if (i !== undefined) df[i]++
    }
  }

  // Smoothed IDF: log((N+1)/(df+1)) + 1
  const idf = df.map((d) => Math.log((N + 1) / (d + 1)) + 1)

  // Store globally for query-time use
  _vocab = vocab
  _idf = idf

  return docs.map((doc) => buildVector(doc, vocab, idf))
}

/**
 * Embed a single query using the fitted TF-IDF model.
 * embedBatch() must have been called first.
 */
export async function embedText(text) {
  if (!_vocab || !_idf) {
    throw new Error('Please upload a PDF before asking a question.')
  }
  return buildVector(tokenize(text), _vocab, _idf)
}

// ─── Groq Generation ─────────────────────────────────────────────────────────

export async function generateStream(messages) {
  if (!GROQ_KEY) {
    throw new Error('Missing Groq API key. Add VITE_GROQ_API_KEY to your .env file.')
  }

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      stream: true,
      messages: messages.map((m) => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      })),
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || res.statusText || `HTTP ${res.status}`
    throw new Error(`Generation failed: ${msg}`)
  }

  return res.body
}

/**
 * Parse OpenAI-compatible SSE stream from Groq and yield text chunks.
 */
export async function* parseGeminiStream(stream) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const json = line.slice(6).trim()
      if (json === '[DONE]') return
      try {
        const parsed = JSON.parse(json)
        const text = parsed?.choices?.[0]?.delta?.content
        if (text) yield text
      } catch {
        // incomplete chunk, skip
      }
    }
  }
}
