import { describe, it, expect } from 'vitest';
import { buildLatentSpace, projectQuery, cosineSimilarity } from '../src/domain/lsa';

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr');
}
function tokenize(value: string) {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}
// Corpus jouet à deux thématiques nettes (sécurité des enfants / finances associatives), plus un
// document « pont » (d5) qui ne partage AUCUN mot avec les deux premiers au-delà du contexte
// (« jardin », « surveillance »), et un document sans rapport (d6). Reproduit la démonstration
// classique de Deerwester et al. (1990) : la LSA doit rapprocher d5 du thème sécurité même sans
// recouvrement lexical direct avec les mots-clés du thème.
const docs = [
  { id: 'd1', text: 'Surveillance des enfants dans le jardin, protection et securite renforcee' },
  { id: 'd2', text: 'Protection et securite des enfants pendant les sorties exterieures' },
  { id: 'd3', text: 'Budget previsionnel et subvention de la CAF pour la tresorerie annuelle' },
  { id: 'd4', text: 'Cotisation annuelle et tresorerie de association, budget serre cette annee' },
  { id: 'd5', text: 'Surveillance renforcee au jardin pendant les activites du mercredi' },
  { id: 'd6', text: 'Renouvellement du materiel pedagogique et rangement du local associatif' },
];
function buildTfidfPostings() {
  const docTerms = new Map(docs.map((d) => [d.id, tokenize(d.text)]));
  const docFreq = new Map<string, number>();
  for (const terms of docTerms.values())
    for (const term of new Set(terms)) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  const idf = new Map([...docFreq].map(([term, freq]) => [term, Math.log(1 + docs.length / freq)]));
  const postings = new Map<string, Map<string, number>>();
  for (const [docId, terms] of docTerms) {
    const counts = new Map<string, number>();
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
    let normSq = 0;
    const weights = new Map<string, number>();
    for (const [term, count] of counts) {
      const w = count * idf.get(term)!;
      weights.set(term, w);
      normSq += w * w;
    }
    const norm = Math.sqrt(normSq) || 1;
    for (const [term, w] of weights) {
      let bucket = postings.get(term);
      if (!bucket) postings.set(term, (bucket = new Map()));
      bucket.set(docId, w / norm);
    }
  }
  return postings;
}
function query(space: ReturnType<typeof buildLatentSpace>, text: string) {
  const weights = new Map(tokenize(text).map((term) => [term, 1]));
  return projectQuery(space, weights);
}

describe('LSA (analyse sémantique latente) : généralisation au-delà du mot exact', () => {
  it('sans troncature réelle (k = nombre de documents), aucune généralisation ne se produit', () => {
    const space = buildLatentSpace(
      docs.map((d) => d.id),
      buildTfidfPostings(),
      docs.length,
    );
    const q = query(space, 'enfants');
    // Rang plein : la LSA ne fait alors que reproduire la similarité cosinus du texte brut — d5
    // ne partage aucun mot avec la requête et obtient une similarité nulle.
    expect(cosineSimilarity(q, space.docEmbeddings.get('d5')!)).toBeCloseTo(0, 3);
  });

  it('avec une troncature réelle (k ≪ nombre de documents), rapproche un document sans mot commun de son thème latent', () => {
    const space = buildLatentSpace(docs.map((d) => d.id), buildTfidfPostings(), 2);
    const forEnfants = query(space, 'enfants');
    const simD5 = cosineSimilarity(forEnfants, space.docEmbeddings.get('d5')!);
    const simD3 = cosineSimilarity(forEnfants, space.docEmbeddings.get('d3')!);
    const simD6 = cosineSimilarity(forEnfants, space.docEmbeddings.get('d6')!);
    // d5 ne contient ni « enfants » ni « securite », seulement le contexte « jardin » /
    // « surveillance » partagé avec d1 et d2 : la LSA doit néanmoins le rapprocher nettement du
    // thème sécurité, et clairement plus qu'un document du thème budget ou hors sujet.
    expect(simD5).toBeGreaterThan(0.9);
    expect(simD5).toBeGreaterThan(simD3 + 0.5);
    expect(simD5).toBeGreaterThan(simD6 + 0.5);
  });

  it('sépare nettement les deux thématiques du corpus', () => {
    const space = buildLatentSpace(docs.map((d) => d.id), buildTfidfPostings(), 2);
    const forBudget = query(space, 'budget subvention');
    expect(cosineSimilarity(forBudget, space.docEmbeddings.get('d3')!)).toBeGreaterThan(0.9);
    expect(cosineSimilarity(forBudget, space.docEmbeddings.get('d4')!)).toBeGreaterThan(0.9);
    expect(cosineSimilarity(forBudget, space.docEmbeddings.get('d1')!)).toBeLessThan(0.3);
  });
});
