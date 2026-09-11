// Recherche hybride, locale et sans dépendance : un signal lexical (BM25, la formule utilisée
// par défaut par Elasticsearch/Lucene) est combiné à un signal sémantique latent (LSA, par SVD
// tronquée — voir lsa.ts) qui rapproche des textes partageant des thèmes sans partager un seul
// mot exact. Un index inversé limite BM25 aux seuls documents partageant au moins un mot avec la
// requête ; la LSA peut en plus proposer un document qui n'en partage aucun, si sa similarité
// latente est assez nette pour ne pas être du bruit.
import { buildLatentSpace, cosineSimilarity, projectQuery, type LatentSpace } from './lsa.js';

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
function termCounts(value: string) {
  const counts = new Map<string, number>();
  for (const word of tokenize(value)) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

// Paramètres BM25 usuels (ceux par défaut d'Elasticsearch/Lucene) : k1 règle la vitesse de
// saturation de la fréquence d'un terme (les répétitions supplémentaires comptent de moins en
// moins), b règle la force de la normalisation par longueur de document.
const BM25_K1 = 1.5;
const BM25_B = 0.75;
// Taille minimale de corpus en dessous de laquelle une SVD n'a pas assez de signal statistique
// pour être fiable : le classement reste alors purement lexical (BM25).
const LSA_MIN_DOCS = 6;
// Dimensions latentes conservées après troncature de la SVD. La troncature doit rester
// nettement inférieure au nombre de documents : sans cela, la SVD devient de rang plein (aucune
// dimension écartée) et ne fait plus que reproduire la similarité cosinus du texte brut, sans
// généralisation sémantique. Trop peu de dimensions, à l'inverse, force des thèmes distincts à
// partager le même axe et les confond entre eux (vérifié empiriquement : avec seulement deux
// thèmes réels dans le corpus, deux dimensions ne suffisent pas à les séparer proprement, trois
// le permettent). La moitié du nombre de documents, plafonnée à 64 pour borner le coût sur un
// grand corpus, est un compromis usuel en analyse sémantique latente entre ces deux excès.
function latentDimensions(docCount: number) {
  return Math.max(2, Math.min(64, Math.floor(docCount / 2)));
}
// Similarité latente minimale pour proposer un document qui ne partage pourtant aucun mot avec
// la requête : évite qu'un bruit de fond (une similarité résiduelle non nulle existe presque
// toujours) ne fasse apparaître la totalité du corpus à chaque recherche.
const SEMANTIC_ONLY_THRESHOLD = 0.2;
// Poids du mélange lexical / sémantique dans le score final : le lexical domine quand il est
// présent, le sémantique agit comme un filet de récupération quand le vocabulaire diffère.
const LEXICAL_WEIGHT = 0.7;
const SEMANTIC_WEIGHT = 0.3;

export interface VectorIndex {
  totalDocs: number;
  docLength: Map<string, number>;
  avgDocLength: number;
  docFreq: Map<string, number>;
  termPostings: Map<string, Map<string, number>>;
  lsa: LatentSpace | null;
}

export function buildVectorIndex<T>(
  items: readonly T[],
  id: (item: T) => string,
  text: (item: T) => string,
): VectorIndex {
  const docIds: string[] = [],
    docTerms = new Map<string, Map<string, number>>(),
    docLength = new Map<string, number>(),
    docFreq = new Map<string, number>();
  for (const item of items) {
    const docId = id(item),
      counts = termCounts(text(item));
    docIds.push(docId);
    docTerms.set(docId, counts);
    docLength.set(
      docId,
      [...counts.values()].reduce((sum, count) => sum + count, 0),
    );
    for (const term of counts.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }
  const totalDocs = docIds.length || 1,
    avgDocLength = docIds.length
      ? [...docLength.values()].reduce((sum, length) => sum + length, 0) / docIds.length
      : 1;
  const termPostings = new Map<string, Map<string, number>>();
  for (const [docId, counts] of docTerms)
    for (const [term, count] of counts) {
      let bucket = termPostings.get(term);
      if (!bucket) termPostings.set(term, (bucket = new Map()));
      bucket.set(docId, count);
    }
  // La SVD utilise un poids tf-idf classique (log-fréquence implicite via idf, normalisé par
  // document) plutôt que les poids BM25 : c'est la pondération standard de l'analyse sémantique
  // latente depuis Deerwester et al. (1990), indépendante des paramètres k1/b propres à BM25.
  const idf = new Map<string, number>();
  for (const [term, freq] of docFreq) idf.set(term, Math.log(1 + totalDocs / freq));
  let lsa: LatentSpace | null = null;
  if (docIds.length >= LSA_MIN_DOCS) {
    const tfidfPostings = new Map<string, Map<string, number>>();
    const norms = new Map<string, number>();
    for (const [docId, counts] of docTerms) {
      let normSq = 0;
      for (const [term, count] of counts) normSq += (count * idf.get(term)!) ** 2;
      norms.set(docId, Math.sqrt(normSq) || 1);
    }
    for (const [term, bucket] of termPostings) {
      const weighted = new Map<string, number>();
      for (const [docId, count] of bucket)
        weighted.set(docId, (count * idf.get(term)!) / norms.get(docId)!);
      tfidfPostings.set(term, weighted);
    }
    lsa = buildLatentSpace(docIds, tfidfPostings, latentDimensions(docIds.length));
  }
  return { totalDocs: docIds.length, docLength, avgDocLength, docFreq, termPostings, lsa };
}

export function relevance(index: VectorIndex, query: string): Map<string, number> {
  const queryTerms = termCounts(query);
  if (!queryTerms.size) return new Map();

  const bm25Scores = new Map<string, number>();
  for (const [term, queryFreq] of queryTerms) {
    const bucket = index.termPostings.get(term);
    if (!bucket) continue;
    const df = index.docFreq.get(term) ?? 0;
    const idf = Math.log((index.totalDocs - df + 0.5) / (df + 0.5) + 1);
    if (idf <= 0) continue;
    for (const [docId, termFreq] of bucket) {
      const length = index.docLength.get(docId) ?? index.avgDocLength;
      const denom = termFreq + BM25_K1 * (1 - BM25_B + (BM25_B * length) / index.avgDocLength);
      bm25Scores.set(
        docId,
        (bm25Scores.get(docId) ?? 0) + idf * ((termFreq * (BM25_K1 + 1)) / denom) * queryFreq,
      );
    }
  }
  if (!index.lsa) return bm25Scores;

  const queryEmbedding = projectQuery(index.lsa, queryTerms);
  const lsaScores = new Map<string, number>();
  for (const [docId, embedding] of index.lsa.docEmbeddings) {
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    if (similarity > 0) lsaScores.set(docId, similarity);
  }

  const maxBm25 = Math.max(0, ...bm25Scores.values());
  const scores = new Map<string, number>();
  const candidates = new Set([...bm25Scores.keys(), ...lsaScores.keys()]);
  for (const docId of candidates) {
    const semantic = lsaScores.get(docId) ?? 0;
    if (!bm25Scores.has(docId) && semantic < SEMANTIC_ONLY_THRESHOLD) continue;
    const lexical = maxBm25 > 0 ? (bm25Scores.get(docId) ?? 0) / maxBm25 : 0;
    const score = LEXICAL_WEIGHT * lexical + SEMANTIC_WEIGHT * semantic;
    if (score > 1e-9) scores.set(docId, score);
  }
  return scores;
}
