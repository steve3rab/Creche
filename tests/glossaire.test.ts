import { describe, it, expect } from 'vitest';
import { newBase, glossaryEntrySchema } from '../src/domain/models';
import { expandGlossaryTag, selectGlossary } from '../src/domain/glossaire';
describe('Glossaire : expansion « @clé » et recherche', () => {
  const glossary = [
    glossaryEntrySchema.parse({
      ...newBase(),
      cle: 'CRIP',
      valeur: 'Cellule de Recueil des Informations Préoccupantes',
      description: 'Signalement des situations préoccupantes concernant un enfant.',
    }),
    glossaryEntrySchema.parse({
      ...newBase(),
      cle: 'pmi',
      valeur: 'Protection Maternelle et Infantile',
      description: 'Service départemental qui délivre l’agrément.',
    }),
  ];
  it('développe la clé suivie d’un espace en fin de saisie', () => {
    const text = 'Contacter la @pmi ';
    const result = expandGlossaryTag(text, text.length, glossary);
    expect(result?.text).toBe('Contacter la Protection Maternelle et Infantile ');
    expect(result?.cursor).toBe(result?.text.length);
  });
  it('reconnaît la clé sans tenir compte de la casse', () => {
    const text = 'Voir la @crip,';
    const result = expandGlossaryTag(text, text.length, glossary);
    expect(result?.text).toBe('Voir la Cellule de Recueil des Informations Préoccupantes,');
  });
  it('déclenche aussi sur un saut de ligne ou une ponctuation courante', () => {
    for (const mark of [' ', '\n', '.', ',', ';', ':', '!', '?']) {
      const text = `@pmi${mark}`;
      const result = expandGlossaryTag(text, text.length, glossary);
      expect(result?.text).toBe(`Protection Maternelle et Infantile${mark}`);
    }
  });
  it('ne déclenche rien tant que la clé n’est pas fermée par une limite de mot', () => {
    const text = 'Voir la @pm';
    expect(expandGlossaryTag(text, text.length, glossary)).toBeNull();
  });
  it('ignore une clé qui n’existe pas dans le glossaire', () => {
    const text = 'Voir @inconnu ';
    expect(expandGlossaryTag(text, text.length, glossary)).toBeNull();
  });
  it('ne modifie pas le texte après le curseur (édition au milieu du texte)', () => {
    const text = '@pmi et la suite du texte';
    const cursor = '@pmi '.length;
    const result = expandGlossaryTag(text, cursor, glossary);
    expect(result?.text).toBe('Protection Maternelle et Infantile et la suite du texte');
    expect(result?.cursor).toBe('Protection Maternelle et Infantile '.length);
  });
  it('trie par clé et filtre sur la clé, la valeur ou la description', () => {
    expect(selectGlossary(glossary, '').map((g) => g.cle)).toEqual(['CRIP', 'pmi']);
    expect(selectGlossary(glossary, 'agrément').map((g) => g.cle)).toEqual(['pmi']);
    expect(selectGlossary(glossary, 'signalement').map((g) => g.cle)).toEqual(['CRIP']);
    expect(selectGlossary(glossary, 'introuvable')).toEqual([]);
  });
  it('refuse une clé vide, avec espace ou avec @', () => {
    for (const cle of ['', 'deux mots', 'a@b'])
      expect(
        glossaryEntrySchema.safeParse({ ...newBase(), cle, valeur: 'x', description: '' }).success,
      ).toBe(false);
  });
});
