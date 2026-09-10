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

describe('BM25 : normalisation par longueur, à la différence du tf-idf brut', () => {
  it('favorise un document court et ciblé sur un document long qui répète le même mot', () => {
    const docs = [
      { id: 'court', text: 'Réunion budget association' },
      {
        id: 'long',
        text: Array(40).fill('divers points administratifs').join(' ') + ' réunion budget',
      },
    ];
    const index = buildVectorIndex(
      docs,
      (d) => d.id,
      (d) => d.text,
    );
    const scores = relevance(index, 'reunion budget');
    // Les deux contiennent les deux mots une fois chacun ; BM25 pénalise le document bien plus
    // long (sa longueur, très supérieure à la moyenne, réduit le poids de ses occurrences).
    expect(scores.get('court')!).toBeGreaterThan(scores.get('long')!);
  });
});

describe('Recherche hybride BM25 + LSA : généralisation au-delà du mot exact', () => {
  const docs = [
    { id: 'd1', text: 'Surveillance des enfants dans le jardin, protection et securite renforcee' },
    { id: 'd2', text: 'Protection et securite des enfants pendant les sorties exterieures' },
    { id: 'd3', text: 'Budget previsionnel et subvention de la CAF pour la tresorerie annuelle' },
    { id: 'd4', text: 'Cotisation annuelle et tresorerie de association, budget serre cette annee' },
    { id: 'd5', text: 'Surveillance renforcee au jardin pendant les activites du mercredi' },
    { id: 'd6', text: 'Renouvellement du materiel pedagogique et rangement du local associatif' },
  ];
  const index = buildVectorIndex(
    docs,
    (d) => d.id,
    (d) => d.text,
  );
  it('active la LSA à partir de six documents et retrouve un document sans le mot recherché', () => {
    expect(index.lsa).not.toBeNull();
    const scores = relevance(index, 'enfants');
    // d1 et d2 contiennent le mot : ils dominent. d5 ne le contient pas mais partage le contexte
    // (jardin, surveillance) : il doit malgré tout apparaître, sans le budget (d3, d4) ni le
    // document hors sujet (d6), qui n'ont pas de rapport thématique.
    expect(scores.get('d1')!).toBeGreaterThan(0);
    expect(scores.get('d2')!).toBeGreaterThan(0);
    expect(scores.get('d5')!).toBeGreaterThan(0);
    expect(scores.has('d3')).toBe(false);
    expect(scores.has('d4')).toBe(false);
    expect(scores.has('d6')).toBe(false);
    // Une correspondance lexicale directe reste mieux classée qu'une simple parenté sémantique.
    expect(scores.get('d1')!).toBeGreaterThan(scores.get('d5')!);
  });
  it('reste purement lexical (BM25) en dessous du seuil minimal de corpus pour la LSA', () => {
    const small = buildVectorIndex(
      docs.slice(0, 3),
      (d) => d.id,
      (d) => d.text,
    );
    expect(small.lsa).toBeNull();
    expect([...relevance(small, 'enfants').keys()]).toEqual(['d1', 'd2']);
  });
});
