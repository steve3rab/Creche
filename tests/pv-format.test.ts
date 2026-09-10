import { describe, it, expect } from 'vitest';
import { formatPvText } from '../src/domain/pv-format';
describe('Mise en forme du PV : gras, italique, souligné, surligné, listes', () => {
  it('convertit le texte simple en conservant les retours à la ligne', () => {
    expect(formatPvText('Première ligne\nDeuxième ligne')).toBe('Première ligne<br>Deuxième ligne');
  });
  it('reconnaît le gras, l’italique et le surligné en syntaxe Markdown standard', () => {
    expect(formatPvText('**gras**')).toBe('<strong>gras</strong>');
    expect(formatPvText('*italique*')).toBe('<em>italique</em>');
    expect(formatPvText('==surligné==')).toBe('<mark>surligné</mark>');
    expect(formatPvText('Une **décision** *urgente* ==2026==')).toBe(
      'Une <strong>décision</strong> <em>urgente</em> <mark>2026</mark>',
    );
  });
  it('reconnaît le soulignement via la balise <u>, l’échappatoire de Markdown pour ce que sa syntaxe ne couvre pas', () => {
    expect(formatPvText('<u>souligné</u>')).toBe('<u>souligné</u>');
    expect(formatPvText('Le <u>budget</u> voté')).toBe('Le <u>budget</u> voté');
  });
  it('reconnaît les titres # à ###### comme en Markdown', () => {
    expect(formatPvText('# Titre 1')).toBe('<h1>Titre 1</h1>');
    expect(formatPvText('## Titre 2')).toBe('<h2>Titre 2</h2>');
    expect(formatPvText('### Titre 3')).toBe('<h3>Titre 3</h3>');
    expect(formatPvText('###### Titre 6')).toBe('<h6>Titre 6</h6>');
    expect(formatPvText('#SansEspace')).toBe('#SansEspace');
  });
  it('applique le gras et le surlignage à l’intérieur des titres', () => {
    expect(formatPvText('## **Décision** ==clé==')).toBe(
      '<h2><strong>Décision</strong> <mark>clé</mark></h2>',
    );
  });
  it('convertit une liste à puces en <ul>, avec - ou * comme en Markdown', () => {
    expect(formatPvText('- Premier point\n- Deuxième point')).toBe(
      '<ul><li>Premier point</li><li>Deuxième point</li></ul>',
    );
    expect(formatPvText('* Premier point\n* Deuxième point')).toBe(
      '<ul><li>Premier point</li><li>Deuxième point</li></ul>',
    );
  });
  it('ne confond pas une puce « * » avec le début d’un texte en italique', () => {
    expect(formatPvText('*urgent* point à traiter')).toBe('<em>urgent</em> point à traiter');
  });
  it('convertit une liste numérotée en <ol>, quels que soient les numéros tapés', () => {
    expect(formatPvText('1. Premier\n2. Deuxième')).toBe(
      '<ol><li>Premier</li><li>Deuxième</li></ol>',
    );
    expect(formatPvText('1. Premier\n1. Encore premier')).toBe(
      '<ol><li>Premier</li><li>Encore premier</li></ol>',
    );
  });
  it('mélange texte, listes et texte à nouveau dans le bon ordre', () => {
    expect(formatPvText('Introduction\n- Un\n- Deux\nConclusion')).toBe(
      'Introduction<ul><li>Un</li><li>Deux</li></ul>Conclusion',
    );
  });
  it('applique le gras et le surlignage à l’intérieur des éléments de liste', () => {
    expect(formatPvText('- **Important** : à revoir')).toBe(
      '<ul><li><strong>Important</strong> : à revoir</li></ul>',
    );
  });
  it('échappe le HTML brut avant d’appliquer la mise en forme (pas d’injection)', () => {
    expect(formatPvText('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(formatPvText('Le budget est < 200€ & > 100€')).toBe(
      'Le budget est &lt; 200€ &amp; &gt; 100€',
    );
  });
  it('ne laisse passer que la balise <u> — toute autre balise reste échappée', () => {
    expect(formatPvText('<b>gras</b>')).toBe('&lt;b&gt;gras&lt;/b&gt;');
    expect(formatPvText('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('retourne une chaîne vide pour un contenu vide', () => {
    expect(formatPvText('')).toBe('');
  });
});
