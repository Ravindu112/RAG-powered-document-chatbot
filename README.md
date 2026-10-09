# DocChat — RAG-powered Document Chatbot

Upload any PDF and ask questions about it. Built with Google Gemini (free tier) and runs entirely in the browser — no backend, no database.

## Stack

| Layer | Choice | Why |
|---|---|---|
| LLM | Gemini 1.5 Flash | Free, fast, 1M context window |
| Embeddings | Gemini text-embedding-004 | Free, 768-dim, same API key |
| Vector search | In-memory cosine similarity | No DB needed for a demo |
| PDF parsing | pdfjs-dist | Runs in-browser, no server |
| Frontend | React + Vite | Fast to build and deploy |
| Hosting | Vercel | Free, zero config |

## Setup

1. Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com) — no credit card needed.
2. Copy `.env.example` to `.env` and paste your key.
3. Install and run:

```bash
npm install
npm run dev
```

4. Open http://localhost:5173, upload a PDF, and start chatting.

## How it works (RAG Pipeline)

```
PDF Upload
    │
    ▼
[1] Parse       pdfjs-dist extracts raw text from every page
    │
    ▼
[2] Chunk       Text split into ~200-word overlapping windows (30-word overlap)
    │            Overlap prevents key sentences from being cut mid-thought
    ▼
[3] Embed       Each chunk → 768-dim vector via Gemini text-embedding-004
    │            Vectors stored in an in-memory array (VectorStore)
    ▼
[4] Query time: embed the user's question, cosine-similarity search
    │            top-5 chunks retrieved as context
    ▼
[5] Generate    Gemini 1.5 Flash generates a grounded answer, streamed token-by-token
```

## Interview talking points

**Why overlapping chunks?**
If a key sentence falls at the boundary of a chunk, without overlap it gets split across two chunks and retrieved partially or not at all. Overlap ensures every sentence appears in full in at least one chunk.

**Why cosine similarity?**
Embedding vectors encode semantic meaning. Cosine similarity measures the angle between vectors regardless of magnitude — so "car" and "automobile" return a high score even though the words differ. Euclidean distance would be affected by vector magnitude, which isn't meaningful here.

**What would you change in production?**
- Replace in-memory store with Supabase pgvector or Pinecone for persistence across sessions
- Add a reranking step (Cohere Rerank or a cross-encoder) after retrieval for better precision
- Use a smarter chunker (semantic chunking based on sentence boundaries, not fixed word count)
- Add a system prompt for consistent tone and citation format

**Why not just send the whole PDF as context?**
Gemini 1.5 Flash supports 1M tokens, but API cost scales with context length. RAG trades a small retrieval step for a much smaller prompt — in production this is a significant cost saving. Also, focused context tends to produce more accurate answers than "here's the whole document."

## Deployment

```bash
npm run build
# Then drag the `dist/` folder to Vercel, Netlify, or any static host
# Set VITE_GEMINI_API_KEY as an environment variable in your host's dashboard
```

> ⚠️ Note: The API key is exposed to the browser (VITE_ prefix). For a production app, proxy Gemini calls through a serverless function (Vercel Edge Functions, Supabase Edge Functions, etc.) to keep the key secret. For a portfolio demo this is an acceptable and common tradeoff — just mention it in interviews.
