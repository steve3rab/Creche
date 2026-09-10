import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
export async function pdfText(buffer: Buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const doc = await task.promise;
  try {
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    }
    return text;
  } finally {
    await task.destroy();
  }
}
