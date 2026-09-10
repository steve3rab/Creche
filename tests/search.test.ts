import { describe, it, expect } from 'vitest';
import { buildVectorIndex, relevance } from '../src/domain/search';

describe('Recherche sémantique (index vectoriel TF-IDF)', () => {
  const docs = [
    { id: 'a', text: 'Le chat noir dort sur le canapé du salon' },
    { id: 'b', text: 'Le chien noir joue dans le jardin avec le chat' },
    { id: 'c', text: 'Réunion du conseil association budget annuel' },
  ];
  const index = buildVectorIndex(
    docs,
    (d) => d.id,
    (d) => d.text,
  );
  it('classe par pertinence : un document partageant plus de mots avec la requête score mieux', () => {
    const scores = relevance(index, 'chat noir jardin');
    expect([...scores.keys()].sort()).toEqual(['a', 'b']);
    expect(scores.get('b')!).toBeGreaterThan(scores.get('a')!);
  });
  it("ignore les documents sans aucun mot commun avec la requête, sans les parcourir tous", () => {
    expect([...relevance(index, 'budget conseil').keys()]).toEqual(['c']);
  });
  it('retourne un résultat vide pour une requête vide ou réduite à des mots vides', () => {
    expect(relevance(index, '').size).toBe(0);
    expect(relevance(index, 'le du').size).toBe(0);
  });
});
