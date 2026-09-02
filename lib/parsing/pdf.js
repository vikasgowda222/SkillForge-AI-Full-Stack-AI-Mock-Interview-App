import "server-only";

/**
 * Extract plain text from a PDF's bytes, server-side. Uses unpdf (a serverless-
 * friendly build of pdf.js) so no native binaries or browser APIs are needed.
 *
 * @param {ArrayBuffer|Uint8Array} bytes - raw PDF file contents
 * @returns {Promise<string>} the merged text of all pages (may be empty for
 *   image-only / scanned PDFs, which have no extractable text layer)
 */
export async function extractPdfText(bytes) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return (typeof text === "string" ? text : "").trim();
}
