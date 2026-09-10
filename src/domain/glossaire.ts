import type { GlossaryEntry } from './models.js';
// A key is "closed" the moment a boundary character follows it, so expansion
// happens live while typing rather than waiting for the field to be saved.
const tagPattern = /@([^\s@.,;:!?]+)([ \t\n.,;:!?])$/;
export function expandGlossaryTag(
  text: string,
  cursor: number,
  glossary: GlossaryEntry[],
): { text: string; cursor: number } | null {
  const match = tagPattern.exec(text.slice(0, cursor));
  if (!match) return null;
  const [tag, key, mark] = match;
  const entry = glossary.find((g) => g.cle.toLocaleLowerCase('fr') === key.toLocaleLowerCase('fr'));
  if (!entry) return null;
  const start = cursor - tag.length;
  const replacement = entry.valeur + mark;
  return {
    text: text.slice(0, start) + replacement + text.slice(cursor),
    cursor: start + replacement.length,
  };
}
export function sortGlossary(entries: GlossaryEntry[]) {
  return [...entries].sort((a, b) => a.cle.localeCompare(b.cle, 'fr', { sensitivity: 'base' }));
}
export function selectGlossary(entries: GlossaryEntry[], query: string) {
  const q = query.trim().toLocaleLowerCase('fr');
  return sortGlossary(entries).filter(
    (e) => !q || `${e.cle} ${e.valeur} ${e.description}`.toLocaleLowerCase('fr').includes(q),
  );
}
