/**
 * Split text into overlapping chunks for RAG retrieval.
 *
 * Why overlap? If a key sentence lands at the edge of a chunk, overlap
 * ensures it's fully represented in at least one chunk — this is the most
 * common chunking bug in naive RAG implementations, and a good interview
 * talking point.
 *
 * @param {string} text       - Raw extracted text
 * @param {number} chunkSize  - Target words per chunk (default 200)
 * @param {number} overlap    - Words shared between consecutive chunks (default 30)
 * @returns {Array<{ id: number, text: string, wordCount: number }>}
 */
export function chunkText(text, chunkSize = 200, overlap = 30) {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks = []
  let start = 0
  let id = 0

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length)
    const chunkWords = words.slice(start, end)
    chunks.push({
      id: id++,
      text: chunkWords.join(' '),
      wordCount: chunkWords.length,
    })
    if (end === words.length) break
    start += chunkSize - overlap // slide forward, keeping `overlap` words
  }

  return chunks
}
