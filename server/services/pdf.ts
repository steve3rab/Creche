import fs from 'node:fs/promises';
import {
  labels,
  newBase,
  pdfName,
  meetingTypeLabel,
  prettyDate,
  type Config,
  type Meeting,
  type Action,
  type Document,
  type Member,
} from '../../src/domain/models.js';
import { atomicBytes, atomicJson, DataError, type Storage } from './storage.js';
import { meetingSchema, configSchema, documentSchema } from '../../src/domain/models.js';
import { brandDocument, footerHtml, getBrowser, measureBranding } from './pdf-branding.js';
import { childName, meetingWriteSchema } from '../../src/domain/participants.js';
import { formatPvText } from '../../src/domain/pv-format.js';
export const escapeHtml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function documentHtml(
  m: Meeting,
  c: Config,
  kind: string,
  actions: Action[] = [],
  members: Member[] = [],
) {
  if (!['pv', 'convocation', 'ordre-du-jour'].includes(kind))
    throw new DataError('Type de PDF inconnu.', 400);
  const config = configSchema.parse(c);
  const display = {
    ...m,
    participants: m.participants.map((participant) => {
      const proxy = m.participants.find(
        (p) =>
          p.membreId === participant.mandataireId ||
          (!participant.mandataireId && p.nom === participant.mandataire),
      );
      const proxyMember = members.find(
        (member) =>
          member.id === participant.mandataireId ||
          (!participant.mandataireId && member.nomComplet === participant.mandataire),
      );
      return {
        ...participant,
        nom: childName(participant, members),
        mandataire:
          participant.mandataire || participant.mandataireId
            ? proxy
              ? childName(proxy, members)
              : proxyMember?.prenomEnfant || 'Enfant du mandataire non renseigné'
            : '',
      };
    }),
  };
  const displayActions = actions.map((action) => {
    const member =
      members.find((member) => member.id === action.responsableId) ??
      members.find((member) => member.nomComplet === action.responsable);
    return member
      ? { ...action, responsable: member.prenomEnfant || 'Enfant non renseigné' }
      : action;
  });
  return brandDocument(baseDocumentHtml(display, config, kind, displayActions), config);
}
function baseDocumentHtml(m: Meeting, c: Config, kind: string, actions: Action[] = []) {
  const e = escapeHtml;
  const title =
    kind === 'pv' ? 'Procès-verbal' : kind === 'convocation' ? 'Convocation' : 'Ordre du jour';
  const people = ['PRESENT', 'ABSENT', 'EXCUSE', 'PROCURATION']
    .map((state, index) => {
      const rows = m.participants.filter((p) => p.etat === state);
      return `<div class="presence-row"><strong>${['Présents', 'Absents', 'Excusés', 'Procurations'][index]} <span class="count">${rows.length}</span></strong><span>${rows.map((p) => e(p.nom) + (p.mandataire ? ' → ' + e(p.mandataire) : '')).join(', ') || 'Aucun'}</span></div>`;
    })
    .join('');
  const plannedPoints = m.ordreDuJour.filter((point) => !point.spontanee);
  const agenda = plannedPoints.length
    ? `<ol class="agenda">${plannedPoints.map((p) => `<li>${e(p.titre)}</li>`).join('')}</ol>`
    : '<p class="muted">Aucun point programmé.</p>';
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>${e(title)}</title><style>
@page{size:A4;margin:20mm 19mm 22mm}
*{box-sizing:border-box}
body{font:10.5pt/1.55 Arial,sans-serif;color:#263445;margin:0}
header{border-bottom:2px solid #587b79;padding-bottom:15px;margin-bottom:25px}
.brand{font-size:17pt;font-weight:700;color:#243b4a}
.muted{color:#667687;font-size:9pt}
h1{font-size:29pt;line-height:1.15;letter-spacing:-.7px;margin:0 0 9px;color:#203645}
.subtitle{font-size:11pt;color:#597078;margin:0 0 20px}
h2{font-size:13pt;color:#294c59;margin:23px 0 10px;break-after:avoid}
p{margin:7px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.meta{display:grid;grid-template-columns:1fr 1fr;background:#f1f5f6;border:1px solid #dde6e9;border-radius:5px;margin:0 0 22px;padding:13px 16px;gap:12px}
.meta .location{grid-column:1/-1;border-top:1px solid #dce5e8;padding-top:9px}
.label{display:block;font-size:8pt;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#657984;margin-bottom:3px}
.presence-row{display:grid;grid-template-columns:145px 1fr;gap:12px;padding:7px 0;border-bottom:1px solid #e5eaee;break-inside:avoid;overflow-wrap:anywhere}
.count{display:inline-block;font-size:8pt;color:#607581;margin-left:4px}
.agenda{padding-left:25px;margin:8px 0 20px}
li{padding:5px 0 5px 5px;overflow-wrap:anywhere;break-inside:avoid}
li::marker{font-weight:bold;color:#587b79}
section{margin:20px 0;orphans:3;widows:3;break-inside:avoid}
section h2{border-top:1px solid #dbe4e8;padding-top:14px}
.decision{background:#f0f5f3;border-left:3px solid #6a9086;padding:10px 13px;margin-top:12px;break-inside:avoid}
.rich-text{margin:7px 0;overflow-wrap:anywhere}
.rich-text ul,.rich-text ol{margin:6px 0;padding-left:22px}
.rich-text mark{background:#fef08a;padding:0 2px;border-radius:2px}
.rich-text h1,.rich-text h2,.rich-text h3,.rich-text h4,.rich-text h5,.rich-text h6{margin:10px 0 4px;font-weight:700;color:#294c59;break-after:avoid}
.rich-text h1{font-size:12.5pt}
.rich-text h2{font-size:11.5pt}
.rich-text h3,.rich-text h4,.rich-text h5,.rich-text h6{font-size:10.5pt}
.vote{display:flex;gap:22px;border:1px solid #e0e7eb;border-radius:4px;padding:10px 13px;margin:10px 0;break-inside:avoid;font-size:9pt}
.vote strong{font-size:12pt;color:#294c59}
table{width:100%;border-collapse:collapse;font-size:9pt;margin:10px 0 20px;table-layout:fixed}
th{text-align:left;background:#f1f5f6;color:#4f6673;font-size:8pt}
td,th{padding:9px;border-bottom:1px solid #dfe6eb;vertical-align:top;overflow-wrap:anywhere}
tr{break-inside:avoid}thead{display:table-header-group}
.closing{border-top:1px solid #dbe4e8;margin-top:24px;padding-top:12px}
.spontaneous{font-size:8pt;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#657984;margin-left:7px}
</style></head><body>
<header><div class="brand">${e(c.association)}</div><p class="muted">${e(c.adresse)}</p></header>
<h1>${title}</h1><p class="subtitle">${e(meetingTypeLabel(m))}${m.titre === meetingTypeLabel(m) || m.titre === labels[m.type] ? '' : ' · ' + e(m.titre)}</p>
<div class="meta"><div><span class="label">Date</span><strong>${prettyDate(m.date)}</strong></div><div><span class="label">Horaires</span><strong>${e(m.heureDebut)}${m.heureFin ? ' - ' + e(m.heureFin) : ''}</strong></div><div class="location"><span class="label">Lieu</span>${e(m.lieu) || 'Lieu à préciser'}</div></div>
${kind === 'convocation' ? `<p>Vous êtes convié(e) à participer à cette réunion de l’association.</p><p>Cette réunion sera l’occasion de faire le point sur les différents sujets concernant la vie et le fonctionnement de l’association, d’échanger sur les questions à l’ordre du jour et, le cas échéant, de prendre les décisions nécessaires.</p><p><strong>Destinataires :</strong> ${m.participants.map((p) => e(p.nom)).join(', ') || 'Membres de l’association'}</p>` : ''}
${kind === 'pv' ? '<h2>Présences &amp; procurations</h2>' + people : ''}
${kind === 'ordre-du-jour' ? '' : '<h2>Ordre du jour prévu</h2>'}${agenda}
${kind === 'convocation' ? '<p>Votre présence est vivement souhaitée afin de permettre des échanges constructifs et d’assurer le bon déroulement de la réunion.</p>' : ''}
${kind === 'pv' ? m.ordreDuJour.map((p, i) => `<section><h2>${i + 1}. ${e(p.titre)}${p.spontanee ? '<span class="spontaneous">Ajouté en séance</span>' : ''}</h2><div class="rich-text">${formatPvText(p.discussion) || 'Aucun échange consigné.'}</div>${p.decision ? `<div class="decision"><span class="label">Décision</span><div class="rich-text">${formatPvText(p.decision)}</div></div>` : ''}${p.vote ? `<div class="vote"><span><strong>${p.vote.pour}</strong> pour</span><span><strong>${p.vote.contre}</strong> contre</span><span><strong>${p.vote.abstention}</strong> abstention(s)</span></div>` : ''}</section>`).join('') + `<h2>Suivi des actions</h2>${actions.length ? `<table><thead><tr><th style="width:50%">Action</th><th>Responsable</th><th>Échéance</th></tr></thead><tbody>${actions.map((a) => `<tr><td>${e(a.titre)}</td><td>${e(a.responsable) || 'Non attribuée'}</td><td>${prettyDate(a.echeance)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucune action consignée.</p>'}<div class="closing"><p>Heure de clôture : ${e(m.heureFin) || 'Non renseignée'}</p><p class="muted">${m.pvValideLe ? 'Validé le ' + new Date(m.pvValideLe).toLocaleDateString('fr-FR') : 'Brouillon - PV non validé'}</p></div>` : ''}
</body></html>`;
}
export async function generatePdf(store: Storage, id: string, kind: string) {
  await store.assertReady();
  const { meeting: m, file: reunionFile } = await store.meetingWithFile(id);
  const c = await store.config();
  if (kind === 'pv') meetingWriteSchema.parse(m);
  const actions = (await store.list('actions')).filter(
    (a): a is Action => 'reunionSource' in a && a.reunionSource === id,
  );
  const members = (await store.list('membres')).filter(
    (member): member is Member => 'nomComplet' in member,
  );
  const html = documentHtml(m, c, kind, actions, members);
  const browser = await getBrowser();
  const page = await browser.newPage({ javaScriptEnabled: false });
  let bytes: Buffer;
  try {
    page.setDefaultTimeout(15_000);
    await page.route('**/*', (route) => route.abort());
    const footerHeight = await measureBranding(page, c);
    await page.setContent(html);
    bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerHtml(c),
      margin: {
        top: '20mm',
        bottom: `${Math.max(22, Math.ceil((footerHeight * 25.4) / 96) + 12)}mm`,
        left: '19mm',
        right: '19mm',
      },
    });
  } finally {
    await page.close();
  }
  await store.snapshot();
  const dir = reunionFile.replace(/\/reunion\.json$/, '');
  const file = `${dir}/${pdfName(m, kind)}`;
  await atomicBytes(await store.safe(file), bytes);
  await atomicBytes(await store.safe(file.replace(/\.pdf$/, '.html')), Buffer.from(html));
  m.generations[kind] = new Date().toISOString();
  m.updatedAt = new Date().toISOString();
  await atomicJson(await store.safe(reunionFile), m, meetingSchema);
  return { meeting: m, url: `/api/reunions/${id}/pdf/${kind}`, name: pdfName(m, kind), dir };
}
function linkedPvDocument(documents: (Document | Record<string, unknown>)[], meetingId: string) {
  return documents.find(
    (d): d is Document =>
      'reunionSource' in d && d.reunionSource === meetingId && d.categorie === 'proces-verbaux',
  );
}
// Validating a PV locks its content, so the PDF is (re)generated here to capture the
// final, stamped version, then mirrored into Documents for easy access and sharing.
export async function validateMeeting(store: Storage, id: string) {
  await store.setValidation(id, true);
  const { meeting, name, dir } = await generatePdf(store, id, 'pv');
  const bytes = await fs.readFile(await store.safe(`${dir}/${name}`));
  const existing = linkedPvDocument(await store.list('documents'), id);
  if (existing) {
    await atomicBytes(await store.safe(existing.fichier), bytes);
    await store.saveRecord('documents', { ...existing, nom: name, taille: bytes.length });
  } else {
    const doc = documentSchema.parse({
      ...newBase(),
      nom: name,
      categorie: 'proces-verbaux',
      description: 'Ajouté automatiquement à la validation du PV.',
      archive: false,
      reunionSource: id,
      fichier: '',
      taille: 0,
    });
    doc.fichier = `documents/${doc.categorie}/${doc.id}.pdf`;
    doc.taille = bytes.length;
    await atomicBytes(await store.safe(doc.fichier), bytes);
    await store.saveRecord('documents', doc, true);
  }
  return meeting;
}
// Reopening un-validates the PV, so the copy under Documents (no longer an accurate
// validated record) is retracted; it comes back, refreshed, on the next validation.
export async function reopenMeeting(store: Storage, id: string) {
  const meeting = await store.setValidation(id, false);
  const linked = linkedPvDocument(await store.list('documents'), id);
  if (linked) await store.deleteRecord('documents', linked.id);
  return meeting;
}
