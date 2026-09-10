import type { Note } from './models.js';
export const noteCategories = [
  'Fonctionnement',
  'Secrétariat',
  'Réglementation',
  'Partenaires',
  'Outils',
];
export type NoteSort = 'recent' | 'ancien' | 'titre' | 'importance' | 'categorie';
const rank = { NORMAL: 0, IMPORTANT: 1, PRIORITAIRE: 2, AFFINER: 3 };
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
// Notes hold up to 30 000 characters; normalizing that text is costly, so it is
// cached per note instead of redone for every search word on every keystroke.
const searchTextCache = new WeakMap<Note, string>();
function searchText(note: Note) {
  let cached = searchTextCache.get(note);
  if (cached === undefined) {
    cached = normalize(`${note.titre} ${note.contenu} ${note.categorie}`);
    searchTextCache.set(note, cached);
  }
  return cached;
}
export function selectNotes(
  notes: Note[],
  query: string,
  category: string,
  importance: string,
  sort: NoteSort,
) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return notes
    .filter(
      (note) =>
        (!category || note.categorie === category) &&
        (!importance || note.importance === importance) &&
        (!words.length || words.every((word) => searchText(note).includes(word))),
    )
    .sort((a, b) => {
      const title = a.titre.localeCompare(b.titre, 'fr', { sensitivity: 'base', numeric: true });
      return (
        (sort === 'titre'
          ? title
          : sort === 'importance'
            ? rank[b.importance] - rank[a.importance]
            : sort === 'categorie'
              ? a.categorie.localeCompare(b.categorie, 'fr')
              : sort === 'ancien'
                ? a.updatedAt.localeCompare(b.updatedAt)
                : b.updatedAt.localeCompare(a.updatedAt)) ||
        title ||
        a.id.localeCompare(b.id)
      );
    });
}
