// PDF links configuration for Bridge Partners app
// Store URLs of PDF files in Supabase Storage

const SUPABASE_URL = 'https://jfddwgrnpqcajllmiiak.supabase.co'
const BUCKET_NAME = 'bridge-documents'

export const PDF_DOCUMENTS = {
  laws2007: {
    name: '2007 Laws Complete',
    filename: '2007LawsCompleteBg.pdf',
    description: 'Complete 2007 Laws of Bridge in Bulgarian'
  },
  bridgeBasics: {
    name: 'Bridge Basics Handout',
    filename: 'BridgeBasicsHandout.pdf',
    description: 'Introduction to Bridge - Basics Handout'
  },
  lawsOfBridge: {
    name: 'Laws of Bridge',
    filename: 'Laws of bridge.pdf',
    description: 'Laws of Bridge - Complete Rules'
  },
  introduction: {
    name: 'Въведение в Спортния Бридж',
    filename: 'Въведение в Спортния Бридж.pdf',
    description: 'Introduction to Sports Bridge (Bulgarian)'
  }
}

/**
 * Get public URL for a PDF document
 * @param {string} key - Key from PDF_DOCUMENTS (e.g., 'laws2007')
 * @returns {string} Full public URL to the PDF file
 */
export function getPdfUrl(key) {
  const doc = PDF_DOCUMENTS[key]
  if (!doc) {
    console.warn(`Unknown PDF document: ${key}`)
    return null
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${encodeURIComponent(doc.filename)}`
}

/**
 * Get all PDF documents with their URLs
 * @returns {Object} Documents with keys and full URLs
 */
export function getAllPdfUrls() {
  const urls = {}
  for (const [key, doc] of Object.entries(PDF_DOCUMENTS)) {
    urls[key] = {
      ...doc,
      url: getPdfUrl(key)
    }
  }
  return urls
}

/**
 * Open PDF in new window
 * @param {string} key - Key from PDF_DOCUMENTS
 */
export function openPdf(key) {
  const url = getPdfUrl(key)
  if (url) {
    window.open(url, '_blank')
  }
}
