import { describe, it, expect } from 'vitest';
import { newBase, noteSchema } from '../src/domain/models';
import { selectNotes } from '../src/domain/notes';
describe('Notes : validation, filtres et tri', () => {
  const notes = [
    noteSchema.parse({
      ...newBase(),
      titre: 'Zèbre',
      contenu: 'Sécurité des enfants',
      categorie: 'Partenaires',
      importance: 'PRIORITAIRE',
    }),
    noteSchema.parse({
      ...newBase(),
      titre: 'Alpha',
      contenu: 'Réunion avec la CAF',
      categorie: 'Partenaires',
      importance: 'IMPORTANT',
    }),
    noteSchema.parse({
      ...newBase(),
      titre: 'Budget',
      contenu: 'Préparer le budget',
      categorie: 'Gestion',
    }),
  ];
  it('combine les filtres et cherche dans le contenu sans tenir compte des accents', () => {
    expect(
      selectNotes(notes, 'securite enfants', 'Partenaires', 'PRIORITAIRE', 'titre').map(
        (n) => n.titre,
      ),
    ).toEqual(['Zèbre']);
    expect(selectNotes(notes, 'CAF', 'Gestion', '', 'titre')).toEqual([]);
  });
  it('trie par titre et importance sans modifier la collection source', () => {
    expect(selectNotes(notes, '', '', '', 'titre').map((n) => n.titre)).toEqual([
      'Alpha',
      'Budget',
      'Zèbre',
    ]);
    expect(selectNotes(notes, '', '', '', 'importance').map((n) => n.titre)).toEqual([
      'Zèbre',
      'Alpha',
      'Budget',
    ]);
    expect(notes.map((n) => n.titre)).toEqual(['Zèbre', 'Alpha', 'Budget']);
  });
  it('trie dans les deux sens chronologiques et par catégorie', () => {
    const dated = notes.map((note, i) => ({
      ...note,
      updatedAt: `2026-09-0${i + 1}T12:00:00.000Z`,
    }));
    expect(selectNotes(dated, '', '', '', 'recent')[0].titre).toBe('Budget');
    expect(selectNotes(dated, '', '', '', 'ancien')[0].titre).toBe('Zèbre');
    expect(selectNotes(dated, '', '', '', 'categorie')[0].categorie).toBe('Gestion');
  });
  it('reste correct sur des recherches répétées (texte mis en cache par note)', () => {
    expect(selectNotes(notes, 'zebre', '', '', 'titre').map((n) => n.titre)).toEqual(['Zèbre']);
    expect(selectNotes(notes, 'alpha', '', '', 'titre').map((n) => n.titre)).toEqual(['Alpha']);
    expect(selectNotes(notes, '', '', '', 'titre').map((n) => n.titre)).toEqual([
      'Alpha',
      'Budget',
      'Zèbre',
    ]);
  });
  it('refuse les champs vides et les niveaux inconnus', () => {
    for (const patch of [
      { titre: ' ' },
      { contenu: '\n ' },
      { categorie: '' },
      { importance: 'INCONNU' },
    ])
      expect(noteSchema.safeParse({ ...notes[0], ...patch }).success).toBe(false);
  });
});
