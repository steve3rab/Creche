// Analyse sémantique latente (LSA) : une SVD tronquée de la matrice terme-document projette
// documents et requêtes dans un petit espace de "thèmes" latents. Deux textes peuvent s'y
// rapprocher parce qu'ils partagent des mots de contexte corrélés à travers tout le corpus,
// même sans un seul mot exact en commun — c'est ce qui distingue une recherche sémantique d'une
// simple correspondance lexicale (voir search.ts, qui combine ce signal à BM25).
//
// La matrice de Gram document-document (AᵀA, taille n×n) n'est jamais matérialisée : le produit
// matrice-vecteur nécessaire à symmetricTopEigen s'obtient directement depuis la représentation
// creuse terme → (document → poids), pour un coût proportionnel au nombre de paires
// (terme, document) réellement présentes plutôt qu'au carré du nombre de documents.
import { symmetricTopEigen } from './linalg.js';

const EPSILON = 1e-8;

export interface LatentSpace {
  dimensions: number;
  singularValues: number[];
  docEmbeddings: Map<string, number[]>;
  termEmbeddings: Map<string, number[]>;
}

// Représentation creuse d'un terme par tableaux typés (index de document, poids) plutôt que par
// Map<string, number> : le produit matrice-vecteur ci-dessous est le point chaud de tout le
// calcul (appelé par itération × par dimension latente), où le coût d'un accès Map indexé par
// chaîne domine largement le calcul flottant lui-même. Convertir une fois, avant la boucle,
// change la complexité pratique sans changer la complexité asymptotique.
interface SparseTerm {
  docIndices: Int32Array;
  weights: Float64Array;
}
function toSparseTerms(
  docIndex: ReadonlyMap<string, number>,
  tfidfPostings: ReadonlyMap<string, ReadonlyMap<string, number>>,
): SparseTerm[] {
  const terms: SparseTerm[] = [];
  for (const bucket of tfidfPostings.values()) {
    const docIndices = new Int32Array(bucket.size),
      weights = new Float64Array(bucket.size);
    let i = 0;
    for (const [docId, weight] of bucket) {
      docIndices[i] = docIndex.get(docId)!;
      weights[i] = weight;
      i++;
    }
    terms.push({ docIndices, weights });
  }
  return terms;
}

export function buildLatentSpace(
  docIds: readonly string[],
  tfidfPostings: ReadonlyMap<string, ReadonlyMap<string, number>>,
  dimensions: number,
  seed = 1,
): LatentSpace {
  const docIndex = new Map(docIds.map((docId, i) => [docId, i]));
  const n = docIds.length;
  const terms = toSparseTerms(docIndex, tfidfPostings);
  // A^T A appliqué à v, sans jamais former la matrice n×n : pour chaque terme (une "ligne" de la
  // matrice creuse A), on calcule sa contribution au produit A v (un scalaire), puis on la
  // redistribue immédiatement sur les documents de ce terme — exactement ce que fait Aᵀ(Av),
  // terme par terme.
  const applyGram = (v: readonly number[]) => {
    const result = new Array(n).fill(0);
    for (const { docIndices, weights } of terms) {
      let projected = 0;
      for (let i = 0; i < docIndices.length; i++) projected += weights[i] * v[docIndices[i]];
      if (projected === 0) continue;
      for (let i = 0; i < docIndices.length; i++) result[docIndices[i]] += projected * weights[i];
    }
    return result;
  };
  const { values, vectors } = symmetricTopEigen(n, applyGram, dimensions, { seed });
  const singularValues = values.map((value) => Math.sqrt(Math.max(value, 0)));
  const docEmbeddings = new Map<string, number[]>();
  docIds.forEach((docId, i) => {
    docEmbeddings.set(
      docId,
      singularValues.map((sigma, k) => sigma * vectors[k][i]),
    );
  });
  // Vecteurs termes (U, colonnes de la SVD) : U = A V Σ⁻¹. Une dimension dont la valeur
  // singulière est quasi nulle ne porte aucun signal fiable (bruit numérique) ; elle est mise à
  // zéro plutôt que divisée, pour éviter de l'amplifier artificiellement.
  const termEmbeddings = new Map<string, number[]>();
  let termIndex = 0;
  for (const term of tfidfPostings.keys()) {
    const { docIndices, weights } = terms[termIndex++];
    const raw = new Array(singularValues.length);
    for (let k = 0; k < singularValues.length; k++) {
      let sum = 0;
      const column = vectors[k];
      for (let i = 0; i < docIndices.length; i++) sum += weights[i] * column[docIndices[i]];
      raw[k] = sum;
    }
    termEmbeddings.set(
      term,
      raw.map((value, k) => (singularValues[k] > EPSILON ? value / singularValues[k] : 0)),
    );
  }
  return { dimensions: singularValues.length, singularValues, docEmbeddings, termEmbeddings };
}

// Projette une requête (ou tout nouveau texte) dans le même espace latent que les documents :
// U^T q, ce qui correspond exactement à l'échelle de docEmbeddings (σ · V), rendant les deux
// directement comparables par similarité cosinus.
export function projectQuery(space: LatentSpace, weights: ReadonlyMap<string, number>): number[] {
  const result = new Array(space.dimensions).fill(0);
  for (const [term, weight] of weights) {
    const embedding = space.termEmbeddings.get(term);
    if (!embedding) continue;
    for (let k = 0; k < space.dimensions; k++) result[k] += weight * embedding[k];
  }
  return result;
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > EPSILON ? dot / denom : 0;
}
