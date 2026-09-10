import type { Note } from './models.js';
import { buildVectorIndex, relevance, type VectorIndex } from './search.js';
export const noteCategories = [
  'Fonctionnement',
  'Secrétariat',
  'Réglementation',
  'Partenaires',
  'Outils',
];
export type NoteSort = 'recent' | 'ancien' | 'titre' | 'importance' | 'categorie' | 'pertinence';
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
// Index vectoriel (TF-IDF) mémoïsé par référence de tableau : reconstruit une seule fois par
// rafraîchissement de la liste, jamais à chaque frappe, même pour un grand nombre de notes.
const vectorIndexCache = new WeakMap<Note[], VectorIndex>();
function notesIndex(notes: Note[]) {
  let index = vectorIndexCache.get(notes);
  if (!index) {
    index = buildVectorIndex(
      notes,
      (n) => n.id,
      (n) => `${n.titre} ${n.contenu} ${n.categorie}`,
    );
    vectorIndexCache.set(notes, index);
  }
  return index;
}
export function selectNotes(
  notes: Note[],
  query: string,
  category: string,
  importance: string,
  sort: NoteSort,
) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  // En tri « Pertinence », le classement sémantique (vecteurs) remplace la correspondance
  // exacte de sous-chaîne : une note partageant ne serait-ce qu'un mot avec la requête apparaît,
  // classée par similarité plutôt qu'exclue faute de contenir la phrase entière telle quelle.
  const scores = sort === 'pertinence' && words.length ? relevance(notesIndex(notes), query) : undefined;
  return notes
    .filter(
      (note) =>
        (!category || note.categorie === category) &&
        (!importance || note.importance === importance) &&
        (!words.length ||
          (scores ? scores.has(note.id) : words.every((word) => searchText(note).includes(word)))),
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
                : scores
                  ? (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)
                  : b.updatedAt.localeCompare(a.updatedAt)) ||
        title ||
        a.id.localeCompare(b.id)
      );
    });
}
