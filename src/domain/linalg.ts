// Algèbre linéaire minimale : extrait les k plus grandes valeurs propres et vecteurs propres
// associés d'une matrice symétrique semi-définie positive, par itération de sous-espace
// (« orthogonal iteration » / power iteration par blocs) avec réorthonormalisation de
// Gram-Schmidt modifiée à chaque étape. Cette méthode classique évite de dépendre d'une
// bibliothèque d'algèbre linéaire externe (type LAPACK) tout en restant numériquement stable
// pour les tailles traitées ici (quelques centaines à quelques milliers de documents).
//
// La matrice n'est jamais matérialisée : elle est fournie via une fonction `apply` (produit
// matrice-vecteur), ce qui permet de l'implémenter sous une forme creuse côté appelant.

export interface EigenResult {
  /** Valeurs propres, triées par ordre décroissant. */
  values: number[];
  /** Vecteurs propres associés (normés), vectors[i] correspond à values[i]. */
  vectors: number[][];
}

function dot(a: readonly number[], b: readonly number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// Générateur pseudo-aléatoire déterministe (mulberry32) : l'initialisation du sous-espace doit
// être reproductible pour que les résultats — et les tests qui les vérifient — soient stables
// d'une exécution à l'autre, sans dépendre de Math.random().
function mulberry32(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Orthonormalisation de Gram-Schmidt modifiée (plus stable numériquement que la version
// classique) d'un ensemble de vecteurs colonnes. Retourne Q (orthonormé) et R (triangulaire
// supérieure) tels que colonnes = Q · R.
function qrColumns(columns: readonly number[][]): { q: number[][]; r: number[][] } {
  const k = columns.length;
  const q = columns.map((c) => c.slice());
  const r: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < j; i++) {
      const projection = dot(q[i], q[j]);
      r[i][j] = projection;
      for (let t = 0; t < q[j].length; t++) q[j][t] -= projection * q[i][t];
    }
    const norm = Math.sqrt(dot(q[j], q[j]));
    r[j][j] = norm;
    if (norm > 1e-12) for (let t = 0; t < q[j].length; t++) q[j][t] /= norm;
  }
  return { q, r };
}

function randomOrthonormalBasis(n: number, k: number, rng: () => number): number[][] {
  const columns = Array.from({ length: k }, () => Array.from({ length: n }, () => rng() - 0.5));
  return qrColumns(columns).q;
}

/**
 * Calcule les k plus grandes valeurs propres (et vecteurs propres associés) d'une matrice
 * symétrique semi-définie positive de taille n×n, donnée sous la forme d'un produit
 * matrice-vecteur `apply`. Converge par itération de sous-espace : à chaque étape, le
 * sous-espace courant est appliqué à la matrice puis réorthonormalisé : il s'aligne
 * progressivement sur le sous-espace propre dominant, à une vitesse dépendant de l'écart entre
 * valeurs propres successives (comme pour la méthode de la puissance classique dont il s'agit
 * d'une généralisation par blocs).
 */
export function symmetricTopEigen(
  n: number,
  apply: (vector: readonly number[]) => number[],
  k: number,
  options: { iterations?: number; seed?: number; tolerance?: number } = {},
): EigenResult {
  const iterations = options.iterations ?? 200;
  const tolerance = options.tolerance ?? 1e-6;
  const dimensions = Math.min(k, n);
  if (dimensions <= 0) return { values: [], vectors: [] };
  let basis = randomOrthonormalBasis(n, dimensions, mulberry32(options.seed ?? 1));
  let eigenvalues = new Array(dimensions).fill(Number.POSITIVE_INFINITY);
  for (let iter = 0; iter < iterations; iter++) {
    const applied = basis.map((column) => apply(column));
    const { q, r } = qrColumns(applied);
    basis = q;
    // La diagonale de R est déjà l'estimation des valeurs propres (quotients de Rayleigh
    // Q_new·M·Q_old), sans appel supplémentaire à `apply` : Q_new[j] est par construction
    // Z[j] réorthogonalisé puis normé, donc Q_new[j]·Z[j] = ‖Z[j] réorthogonalisé‖ = R[j][j].
    // Un second passage par `apply` (pour un quotient de Rayleigh Q_new·M·Q_new) ne changerait
    // rien à la convergence mais doublerait le coût de l'étape la plus chère de tout le calcul.
    const next = r.map((row, i) => row[i]);
    let maxChange = 0;
    for (let i = 0; i < dimensions; i++)
      maxChange = Math.max(maxChange, Math.abs(next[i] - eigenvalues[i]));
    eigenvalues = next;
    // Tolérance relative à l'échelle des valeurs propres : une tolérance absolue serait soit
    // inutilement stricte (matrices de grande norme, convergence qui n'aboutit jamais dans le
    // nombre d'itérations imparti), soit trop laxiste (matrices de faible norme).
    if (maxChange < tolerance * Math.max(1, Math.abs(eigenvalues[0]))) break;
  }
  const order = eigenvalues.map((_, i) => i).sort((a, b) => eigenvalues[b] - eigenvalues[a]);
  return {
    values: order.map((i) => eigenvalues[i]),
    vectors: order.map((i) => basis[i]),
  };
}
