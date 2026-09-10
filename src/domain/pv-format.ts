const escapeHtml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const bulletLine = /^\s*[-*]\s+(.*)$/;
const numberedLine = /^\s*\d+[.)]\s+(.*)$/;
const headingLine = /^(#{1,6})\s+(.*)$/;
// Inline markers are matched on already-escaped text, so the only tags they can ever
// introduce are the four below — never anything drawn from the author's own input.
// Bold/italic/highlight follow standard Markdown; underline has no Markdown syntax of
// its own, so it uses Markdown's own escape hatch — literal <u> tags — recognised only
// in their escaped form, which is the sole way this substitution can ever fire.
function inlineFormat(raw: string): string {
  return escapeHtml(raw)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, '<u>$1</u>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>');
}
// A lightweight, author-typed markup (bold/italic/underline/highlight, headings,
// bullet and numbered lists) rendered for the PV — no data is stored as HTML, only
// converted to it at generation time, so existing plain-text minutes keep displaying
// unchanged.
export function formatPvText(raw: string): string {
  const lines = raw.split('\n');
  const blocks: string[] = [];
  let plain: string[] = [];
  const flushPlain = () => {
    if (plain.length) blocks.push(plain.map(inlineFormat).join('<br>'));
    plain = [];
  };
  let i = 0;
  while (i < lines.length) {
    const heading = headingLine.exec(lines[i]);
    if (heading) {
      flushPlain();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    const bullet = bulletLine.exec(lines[i]);
    const numbered = !bullet && numberedLine.exec(lines[i]);
    if (bullet || numbered) {
      flushPlain();
      const pattern = bullet ? bulletLine : numberedLine;
      const tag = bullet ? 'ul' : 'ol';
      const items: string[] = [];
      while (i < lines.length) {
        const match = pattern.exec(lines[i]);
        if (!match) break;
        items.push(`<li>${inlineFormat(match[1])}</li>`);
        i++;
      }
      blocks.push(`<${tag}>${items.join('')}</${tag}>`);
    } else {
      plain.push(lines[i]);
      i++;
    }
  }
  flushPlain();
  return blocks.join('');
}
