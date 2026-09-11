import { describe, it, expect } from 'vitest';
import { symmetricTopEigen } from '../src/domain/linalg';

function matVec(matrix: readonly (readonly number[])[]) {
  return (v: readonly number[]) => matrix.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
}
function dot(a: readonly number[], b: readonly number[]) {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}

describe('symmetricTopEigen (itération de sous-espace)', () => {
  it('retrouve les valeurs propres exactes d’une matrice diagonale, dans l’ordre décroissant', () => {
    const matrix = [
      [5, 0, 0],
      [0, 3, 0],
      [0, 0, 1],
    ];
    const { values, vectors } = symmetricTopEigen(3, matVec(matrix), 2, { tolerance: 1e-12 });
    expect(values[0]).toBeCloseTo(5, 6);
    expect(values[1]).toBeCloseTo(3, 6);
    // Le vecteur propre associé à 5 est ±e0, celui associé à 3 est ±e1.
    expect(Math.abs(vectors[0][0])).toBeCloseTo(1, 6);
    expect(Math.abs(vectors[1][1])).toBeCloseTo(1, 6);
  });

  it('retrouve les valeurs et vecteurs propres analytiques d’une matrice 2×2 connue', () => {
    // [[2,1],[1,2]] a pour valeurs propres 3 et 1, de vecteurs propres (1,1)/√2 et (1,-1)/√2.
    const matrix = [
      [2, 1],
      [1, 2],
    ];
    const { values, vectors } = symmetricTopEigen(2, matVec(matrix), 2, { seed: 7, tolerance: 1e-12 });
    expect(values[0]).toBeCloseTo(3, 6);
    expect(values[1]).toBeCloseTo(1, 6);
    const expected = 1 / Math.sqrt(2);
    expect(Math.abs(vectors[0][0])).toBeCloseTo(expected, 6);
    expect(Math.abs(vectors[0][1])).toBeCloseTo(expected, 6);
    // Même signe ou signes opposés cohérents (le signe global d’un vecteur propre est arbitraire).
    expect(vectors[0][0] * vectors[0][1]).toBeGreaterThan(0);
  });

  it('renvoie des vecteurs propres orthonormés', () => {
    // Matrice de Gram d'un jeu de vecteurs aléatoires (mais fixes) : symétrique, semi-définie positive.
    const raw = [
      [1, 2, 0, 1],
      [0, 1, 3, 0],
      [2, 0, 1, 1],
      [1, 1, 1, 2],
      [0, 2, 1, 0],
    ];
    const gram = raw[0].map((_, i) => raw[0].map((_, j) => dot(raw.map((r) => r[i]), raw.map((r) => r[j]))));
    const { vectors } = symmetricTopEigen(4, matVec(gram), 4, { seed: 3 });
    for (let i = 0; i < vectors.length; i++) {
      expect(dot(vectors[i], vectors[i])).toBeCloseTo(1, 6);
      for (let j = i + 1; j < vectors.length; j++) expect(dot(vectors[i], vectors[j])).toBeCloseTo(0, 6);
    }
  });

  it('reconstruit une matrice de rang connu à partir de ses vecteurs propres (λ · v vᵀ)', () => {
    // M = 4·u·uᵀ + 2·w·wᵀ pour u, w orthonormés : rang 2, valeurs propres exactes 4 et 2.
    const u = [1, 0, 0, 0];
    const w = [0, 1 / Math.sqrt(2), 1 / Math.sqrt(2), 0];
    const n = 4;
    const matrix = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => 4 * u[i] * u[j] + 2 * w[i] * w[j]),
    );
    const { values, vectors } = symmetricTopEigen(n, matVec(matrix), 2, { seed: 11, tolerance: 1e-12 });
    expect(values[0]).toBeCloseTo(4, 5);
    expect(values[1]).toBeCloseTo(2, 5);
    const reconstructed = Array.from({ length: n }, (_, i) =>
      Array.from(
        { length: n },
        (_, j) => values[0] * vectors[0][i] * vectors[0][j] + values[1] * vectors[1][i] * vectors[1][j],
      ),
    );
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) expect(reconstructed[i][j]).toBeCloseTo(matrix[i][j], 5);
  });

  it('gère k supérieur à n sans erreur', () => {
    const { values, vectors } = symmetricTopEigen(2, matVec([[2, 0], [0, 1]]), 5);
    expect(values).toHaveLength(2);
    expect(vectors).toHaveLength(2);
  });
});
