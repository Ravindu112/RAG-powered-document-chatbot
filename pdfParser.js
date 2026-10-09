import * as pdfjsLib from 'pdfjs-dist'

// Point the worker at the file Vite copies into the build output
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

/**
 * Extract plain text from a PDF File object.
 * Returns { text: string, pageCount: number, filename: string }
 */
export async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pageTexts = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    // Join text items; insert a newline when the item ends a line
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    pageTexts.push(pageText)
  }

  return {
    text: pageTexts.join('\n\n'),
    pageCount: pdf.numPages,
    filename: file.name,
  }
}
