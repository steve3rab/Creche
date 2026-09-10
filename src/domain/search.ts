// Recherche sémantique légère, sans dépendance ni réseau : chaque document est représenté par
// un vecteur TF-IDF (poids d'un mot pondéré par sa rareté dans l'ensemble), comparé à la requête
// par similarité cosinus. Un index inversé (terme → documents) limite le travail par requête aux
// seuls documents partageant au moins un mot avec elle, plutôt que de tous les parcourir.
const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'au', 'aux', 'et', 'ou', 'a', 'à', 'en',
  'dans', 'sur', 'pour', 'par', 'avec', 'sans', 'ce', 'cet', 'cette', 'ces', 'que', 'qui', 'quoi',
  'dont', 'se', 'sa', 'son', 'ses', 'ne', 'pas', 'plus', 'moins', 'est', 'sont', 'etre', 'avoir',
  'il', 'elle', 'ils', 'elles', 'on', 'nous', 'vous', 'je', 'tu', 'mais', 'donc', 'or', 'ni', 'car',
]);
function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr');
}
function tokenize(value: string) {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}
export interface VectorIndex {
  postings: Map<string, Map<string, number>>;
  idf: Map<string, number>;
}
export function buildVectorIndex<T>(
  items: readonly T[],
  id: (item: T) => string,
  text: (item: T) => string,
): VectorIndex {
  const docTerms = new Map<string, Map<string, number>>(),
    termDocFreq = new Map<string, number>();
  for (const item of items) {
    const counts = new Map<string, number>();
    for (const word of tokenize(text(item))) counts.set(word, (counts.get(word) ?? 0) + 1);
    docTerms.set(id(item), counts);
    for (const term of counts.keys()) termDocFreq.set(term, (termDocFreq.get(term) ?? 0) + 1);
  }
  const total = items.length || 1,
    idf = new Map<string, number>();
  for (const [term, freq] of termDocFreq) idf.set(term, Math.log(1 + total / freq));
  const postings = new Map<string, Map<string, number>>();
  for (const [docId, counts] of docTerms) {
    const weights = new Map<string, number>();
    let normSq = 0;
    for (const [term, count] of counts) {
      const weight = count * idf.get(term)!;
      weights.set(term, weight);
      normSq += weight * weight;
    }
    const norm = Math.sqrt(normSq) || 1;
    for (const [term, weight] of weights) {
      let bucket = postings.get(term);
      if (!bucket) postings.set(term, (bucket = new Map()));
      bucket.set(docId, weight / norm);
    }
  }
  return { postings, idf };
}
export function relevance(index: VectorIndex, query: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of tokenize(query)) counts.set(word, (counts.get(word) ?? 0) + 1);
  const scores = new Map<string, number>();
  let normSq = 0;
  const queryWeights = new Map<string, number>();
  for (const [term, count] of counts) {
    const idf = index.idf.get(term);
    if (!idf) continue;
    const weight = count * idf;
    queryWeights.set(term, weight);
    normSq += weight * weight;
  }
  const norm = Math.sqrt(normSq) || 1;
  for (const [term, weight] of queryWeights) {
    const bucket = index.postings.get(term);
    if (!bucket) continue;
    const queryWeight = weight / norm;
    for (const [docId, docWeight] of bucket)
      scores.set(docId, (scores.get(docId) ?? 0) + queryWeight * docWeight);
  }
  return scores;
}
