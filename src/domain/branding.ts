import sanitizeHtml from 'sanitize-html';

const legacyDefaultSignatureHtml =
  '<p><strong>Le bureau de l’association</strong><br />Crèche parentale · Ensemble pour les enfants</p>';
export const defaultSignatureHtml = '<p>Crèche parentale · Ensemble pour les enfants</p>';
export function cleanSignature(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'div', 'a'],
    allowedAttributes: { a: ['href'], '*': ['style'] },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowProtocolRelative: false,
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i],
        'text-align': [/^(left|center|right)$/],
        'font-weight': [/^(normal|bold)$/],
        'font-style': [/^(normal|italic)$/],
        'text-decoration': [/^underline$/],
      },
    },
  });
}
export function migrateSignature(html: string) {
  return html === legacyDefaultSignatureHtml ? defaultSignatureHtml : html;
}
export function isLogoDataUrl(value: string) {
  if (!value) return true;
  // Raster images only: no remote URL, SVG, scripts or arbitrary embedded files.
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0 || match[2].length > 1_398_104) return false;
  try {
    const bytes = atob(match[2]);
    return match[1] === 'png'
      ? bytes.startsWith('\x89PNG\r\n\x1a\n') && bytes.length >= 33
      : bytes.startsWith('\xff\xd8\xff') && bytes.endsWith('\xff\xd9');
  } catch {
    return false;
  }
}
