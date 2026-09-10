import fs from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '../server/services/storage.js';
import { seed } from './seed.js';
import { generatePdf } from '../server/services/pdf.js';
import { chromium } from 'playwright';
import { defaultSignatureHtml } from '../src/domain/branding.js';
import { actionSchema, newBase } from '../src/domain/models.js';
const root = path.resolve('tmp/pdf-qa-' + Date.now());
const store = new Storage(path.join(root, 'data'));
const { meetings, members } = await seed(store);
for (const [index, member] of members.entries())
  await store.saveRecord('membres', {
    ...member,
    prenomEnfant: ['Milo', 'Noa', 'Lina', 'Zoé', 'Iris'][index],
  });
const m = await store.meeting(meetings[0].id);
m.heureFin = '21:15';
m.typeSecondaire = 'BUREAU';
m.participants[2].etat = 'PROCURATION';
m.participants[2].mandataire = m.participants[0].nom;
m.participants[2].mandataireId = m.participants[0].membreId;
m.ordreDuJour[0].discussion =
  'Les membres reviennent sur les échanges de la précédente réunion. Le procès-verbal est relu et les observations sont intégrées.';
m.ordreDuJour[0].decision = 'Le procès-verbal précédent est approuvé.';
m.ordreDuJour[0].vote = { pour: 3, contre: 0, abstention: 0 };
m.ordreDuJour[1].discussion =
  'L’organisation de la rentrée est discutée. Les permanences et les responsabilités sont réparties entre les membres.';
m.ordreDuJour[1].decision = 'Une rencontre avec les nouveaux parents sera organisée en septembre.';
await store.saveMeeting(m);
await store.saveRecord(
  'actions',
  actionSchema.parse({
    ...newBase(),
    titre: 'Préparer la rencontre de rentrée et transmettre les informations aux familles',
    responsable: members[0].nomComplet,
    dateCreation: '2026-09-15',
    echeance: '2026-09-30',
    statut: 'A_FAIRE',
    reunionSource: m.id,
  }),
  true,
);
await store.setValidation(m.id, true);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let logoDataUrl: string;
try {
  const page = await browser.newPage();
  logoDataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 560;
    canvas.height = 150;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#e8efdf';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#405e44';
    context.font = 'bold 48px Arial';
    context.fillText('LES FILOUSTICS', 30, 91);
    return canvas.toDataURL('image/png');
  });
} finally {
  await browser.close();
}
for (const variant of ['avec-logo', 'sans-logo']) {
  await store.saveConfig({
    ...(await store.config()),
    logoDataUrl: variant === 'avec-logo' ? logoDataUrl : '',
    signatureHtml:
      variant === 'avec-logo'
        ? '<p><strong>Le secrétariat des Filoustics</strong><br />Crèche parentale · Ensemble pour nos enfants<br /><a href="mailto:secretariat@example.org">secretariat@example.org</a></p>'
        : defaultSignatureHtml,
  });
  for (const kind of ['convocation', 'ordre-du-jour', 'pv']) {
    const r = await generatePdf(store, m.id, kind);
    const output = path.join(root, `${variant}-${r.name}`);
    await fs.copyFile(await store.safe(`${await store.meetingDir(m.id)}/${r.name}`), output);
    console.log(output);
  }
}
await fs.writeFile(path.resolve('tmp/pdf-qa-path.txt'), root);
