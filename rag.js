import { embedText, embedBatch, generateStream, parseGeminiStream } from './gemini.js'
import { parsePDF } from './pdfParser.js'
import { chunkText } from './chunker.js'
import { VectorStore } from './vectorStore.js'

const store = new VectorStore()

/**
 * Ingest a PDF file into the vector store.
 * Calls onProgress({ step, progress }) so the UI can show pipeline stages.
 *
 * Steps: 'parse' → 'chunk' → 'embed' → 'done'
 */
export async function ingestPDF(file, onProgress) {
  store.clear()

  // Step 1: Parse PDF to text
  onProgress({ step: 'parse', progress: 0 })
  const { text, pageCount, filename } = await parsePDF(file)

  // Step 2: Chunk the text
  onProgress({ step: 'chunk', progress: 25 })
  const chunks = chunkText(text, 200, 30)

  // Step 3: Embed all chunks
  onProgress({ step: 'embed', progress: 40 })
  const texts = chunks.map((c) => c.text)
  const embeddings = await embedBatch(texts, 10)

  // Step 4: Store in vector store
  onProgress({ step: 'store', progress: 90 })
  store.addAll(chunks, embeddings)

  onProgress({ step: 'done', progress: 100 })

  return { filename, pageCount, chunkCount: chunks.length }
}

/**
 * Answer a question using RAG:
 * 1. Embed the question
 * 2. Retrieve top-k relevant chunks
 * 3. Build a grounded prompt
 * 4. Stream the Gemini response
 *
 * Calls onChunk(text) for each streamed token.
 */
export async function askQuestion(question, history, onChunk) {
  // 1. Embed question
  const queryEmbedding = await embedText(question)

  // 2. Retrieve relevant context
  const results = store.search(queryEmbedding, 5)
  const context = results
    .map((r, i) => `[Chunk ${i + 1}]\n${r.chunk.text}`)
    .join('\n\n')

  // 3. Build system + grounded user message
  // We inject context into the first user turn rather than a system message
  // because Gemini's free API doesn't support a separate system role.
  const systemPrompt = `You are a helpful assistant that answers questions strictly based on the provided document context.
If the answer is not found in the context, say "I couldn't find that in the document."
Always be concise and cite which chunk your answer came from when relevant.

DOCUMENT CONTEXT:
${context}`

  const messages = [
    // Previous conversation (excluding the system injection)
    ...history.map((m) => ({ role: m.role, content: m.content })),
    // Current question with context injected
    {
      role: 'user',
      content: history.length === 0
        ? `${systemPrompt}\n\nQuestion: ${question}`
        : `Question: ${question}\n\nContext:\n${context}`,
    },
  ]

  // 4. Stream the response
  const stream = await generateStream(messages)
  let fullText = ''
  for await (const chunk of parseGeminiStream(stream)) {
    fullText += chunk
    onChunk(chunk)
  }

  return { answer: fullText, retrievedChunks: results }
}

export function isDocumentLoaded() {
  return store.size > 0
}
