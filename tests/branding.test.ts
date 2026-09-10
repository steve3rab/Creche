import { describe, it, expect } from 'vitest';
import { configSchema, newMeeting } from '../src/domain/models';
import { cleanSignature, defaultSignatureHtml } from '../src/domain/branding';
import { documentHtml } from '../server/services/pdf';
describe('Présentation des documents', () => {
  it('lit les anciens paramètres avec une signature par défaut sans logo', () => {
    const config = configSchema.parse({ schemaVersion: 1, association: 'Ma crèche' });
    expect(config.signatureHtml).toBe(defaultSignatureHtml);
    expect(config.logoDataUrl).toBe('');
    expect(documentHtml(newMeeting(), config, 'convocation')).toContain(
      '<div class="brand">Ma crèche</div>',
    );
  });
  it('remplace le modèle historique « Le bureau » par le nouveau pied de page neutre', () => {
    expect(
      configSchema.parse({
        schemaVersion: 1,
        association: 'Ma crèche',
        signatureHtml:
          '<p><strong>Le bureau de l’association</strong><br />Crèche parentale · Ensemble pour les enfants</p>',
      }).signatureHtml,
    ).toBe(defaultSignatureHtml);
  });
  it('conserve la mise en forme et filtre scripts, événements, images et styles dangereux', () => {
    const html = cleanSignature(
      '<script>alert(1)</script><p onclick="alert(1)" style="position:fixed;color:#123456">Bonjour <strong>parents</strong><img src="https://example.org/x"><a href="javascript:alert(1)">Lien</a></p>',
    );
    expect(html).toContain('<strong>parents</strong>');
    expect(html).toContain('color:#123456');
    for (const forbidden of ['script', 'onclick', '<img', 'position', 'javascript:'])
      expect(html).not.toContain(forbidden);
  });
  it('refuse SVG, URL externe, image invalide et HTML démesuré', () => {
    const base = { schemaVersion: 1, association: 'Test' };
    for (const logoDataUrl of [
      'https://example.org/logo.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/png;base64,AAAA',
    ])
      expect(configSchema.safeParse({ ...base, logoDataUrl }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, signatureHtml: 'x'.repeat(4001) }).success).toBe(
      false,
    );
  });
});
