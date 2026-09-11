import { describe, it, expect } from 'vitest';
import { newBase, shiftSchema, memberSchema, configSchema, type Member } from '../src/domain/models';
import { planningDocumentHtml } from '../server/services/pdf';

const config = configSchema.parse({ schemaVersion: 1, association: 'Les Filoustics' });
function member(fields: Partial<Member> = {}) {
  return memberSchema.parse({
    ...newBase(),
    nomComplet: 'Léa Martin',
    fonction: 'Membre',
    ...fields,
  }) as Member;
}
function shift(fields: Partial<ReturnType<typeof shiftSchema.parse>>) {
  return shiftSchema.parse({
    ...newBase(),
    date: '2026-09-15',
    heureDebut: '08:00',
    heureFin: '12:00',
    membreId: newBase().id,
    ...fields,
  });
}

describe('PDF du planning mensuel', () => {
  it('regroupe les créneaux par jour, triés chronologiquement, avec le nom de l’enfant', () => {
    const léa = member({ nomComplet: 'Léa Martin', prenomEnfant: 'Noé' });
    const html = planningDocumentHtml(
      [
        shift({ date: '2026-09-15', heureDebut: '14:00', heureFin: '18:00', membreId: léa.id }),
        shift({ date: '2026-09-02', heureDebut: '08:00', heureFin: '12:00', membreId: léa.id }),
        shift({
          date: '2026-09-15',
          heureDebut: '08:00',
          heureFin: '12:00',
          membreId: léa.id,
          notes: 'Sortie piscine',
        }),
      ],
      [léa],
      config,
      '2026-09',
    );
    // Le 2 précède le 15, et sur le 15, 08:00 précède 14:00 : les deux exigences (tri par
    // jour puis par heure) se vérifient par la position des sous-chaînes dans le document.
    const positions = ['2 septembre', '08:00–12:00 · Noé', 'Sortie piscine', '14:00–18:00 · Noé'].map(
      (needle) => html.indexOf(needle),
    );
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toContain('15 septembre');
  });
  it('affiche le nom complet si l’enfant n’est pas renseigné, puis le nom brut du créneau à défaut de membre', () => {
    const sansEnfant = member({ nomComplet: 'Camille Bernard', prenomEnfant: '' });
    const html = planningDocumentHtml(
      [
        shift({ membreId: sansEnfant.id }),
        // membreId orphelin (le membre a depuis été supprimé) : repli sur le nom brut du créneau.
        shift({ date: '2026-09-16', membreId: newBase().id, membre: 'Bénévole ponctuel' }),
      ],
      [sansEnfant],
      config,
      '2026-09',
    );
    expect(html).toContain('Camille Bernard');
    expect(html).toContain('Bénévole ponctuel');
  });
  it('affiche un message clair quand le mois ne contient aucun créneau', () => {
    const html = planningDocumentHtml([], [], config, '2026-09');
    expect(html).toContain('Aucun créneau enregistré pour ce mois.');
    expect(html).not.toContain('<table>');
  });
  it('préserve visuellement les sauts de ligne d’une note sur plusieurs lignes', () => {
    const léa = member({ nomComplet: 'Léa Martin' });
    const html = planningDocumentHtml(
      [shift({ membreId: léa.id, notes: 'Sortie piscine\nApporter le maillot' })],
      [léa],
      config,
      '2026-09',
    );
    // Le saut de ligne doit survivre l'échappement HTML...
    expect(html).toContain('Sortie piscine\nApporter le maillot');
    // ...et la cellule qui le contient doit le restituer visuellement (sans quoi le
    // comportement par défaut d'un <td> l'effacerait en un seul bloc de texte).
    expect(html).toMatch(/td,th\{[^}]*white-space:pre-wrap/);
  });
  it('affiche le nom et le mois de l’association dans l’en-tête', () => {
    const html = planningDocumentHtml([], [], config, '2026-09');
    expect(html).toContain('<div class="brand">Les Filoustics</div>');
    expect(html).toContain('Septembre 2026');
  });
});
