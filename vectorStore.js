/**
 * Lightweight in-memory vector store.
 * No external DB needed — everything lives in the browser tab.
 *
 * In a production system you'd replace this with Supabase pgvector,
 * Pinecone, or Weaviate. The interface stays identical — good interview
 * talking point about separation of concerns.
 */

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export class VectorStore {
  constructor() {
    this.items = [] // [{ chunk, embedding }]
  }

  /** Add pre-embedded chunks. */
  addAll(chunks, embeddings) {
    this.items = chunks.map((chunk, i) => ({
      chunk,
      embedding: embeddings[i],
    }))
  }

  /** Return the top-k most similar chunks to a query embedding. */
  search(queryEmbedding, topK = 5) {
    return this.items
      .map(({ chunk, embedding }) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  get size() {
    return this.items.length
  }

  clear() {
    this.items = []
  }
}
