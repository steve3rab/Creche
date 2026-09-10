import { describe, it, expect } from 'vitest';
import {
  memberSchema,
  newBase,
  newMeeting,
  configSchema,
  actionSchema,
  type Participant,
} from '../src/domain/models';
import {
  childName,
  memberChoice,
  votingCapacity,
  meetingWriteSchema,
} from '../src/domain/participants';
import { documentHtml } from '../server/services/pdf';
import { footerHtml } from '../server/services/pdf-branding';
describe('Participants, fonctions et votes', () => {
  const member = memberSchema.parse({
    ...newBase(),
    nomComplet: 'Alex Martin',
    prenomEnfant: 'Milo',
    fonction: 'Président',
  });
  const participant: Participant = {
    membreId: member.id,
    nom: member.nomComplet,
    etat: 'PRESENT',
    mandataire: '',
  };
  it('affiche le parent et l’enfant dans les choix et modernise les fonctions existantes', () => {
    expect(memberChoice(member)).toBe('Alex Martin (Milo)');
    expect(member.fonction).toBe('Présidente');
    expect(memberSchema.parse({ ...member, fonction: 'Trésorier adjoint' }).fonction).toBe(
      'Vice-trésorière',
    );
    expect(childName(participant, [member])).toBe('Milo');
    expect(childName(participant)).toBe('Enfant non renseigné');
  });
  it('compte les présents et procurations sans compter deux fois un membre', () => {
    const rows = [
      participant,
      participant,
      { ...participant, membreId: crypto.randomUUID(), etat: 'PROCURATION' as const },
      { ...participant, membreId: crypto.randomUUID(), etat: 'ABSENT' as const },
    ];
    expect(votingCapacity(rows)).toBe(2);
    expect(meetingWriteSchema.safeParse({ ...newMeeting(), participants: rows }).success).toBe(
      false,
    );
  });
  it('refuse le dépassement de la capacité en écriture', () => {
    const meeting = {
      ...newMeeting(),
      participants: [participant],
      ordreDuJour: [
        { id: crypto.randomUUID(), titre: 'Vote', vote: { pour: 1, contre: 1, abstention: 0 } },
      ],
    };
    expect(meetingWriteSchema.safeParse(meeting).success).toBe(false);
    meeting.ordreDuJour[0].vote.contre = 0;
    expect(meetingWriteSchema.safeParse(meeting).success).toBe(true);
  });
  it('n’imprime que les enfants, garde la signature HTML au pied et supprime les blocs de signature du PV', () => {
    const meeting = { ...newMeeting(), participants: [participant] };
    const config = configSchema.parse({
      schemaVersion: 1,
      association: 'Crèche',
      president: 'Personne présidente',
      secretaire: 'Personne secrétaire',
      signatureHtml: '<p>Le bureau · Présidence · Secrétariat</p>',
    });
    const html = documentHtml(meeting, config, 'pv', [], [member]);
    expect(html).toContain('Milo');
    for (const value of [
      'Alex Martin',
      'Personne présidente',
      'Personne secrétaire',
      'Présidence<br>',
      'Secrétariat<br>',
    ])
      expect(html).not.toContain(value);
    for (const kind of ['pv', 'convocation', 'ordre-du-jour']) {
      const doc = documentHtml(meeting, config, kind, [], [member]);
      for (const signature of ['Le bureau', 'Présidence', 'Secrétariat'])
        expect(doc).not.toContain(signature);
      expect(footerHtml(config)).toContain('Le bureau · Présidence · Secrétariat');
      if (kind !== 'pv') expect(doc).not.toContain('<strong>Présents');
    }
  });
  it('associe le responsable d’une action au membre par identifiant, même si le nom a changé', () => {
    const meeting = { ...newMeeting(), participants: [participant] };
    const config = configSchema.parse({ schemaVersion: 1, association: 'Crèche' });
    const action = actionSchema.parse({
      ...newBase(),
      titre: 'Réparer le portail',
      responsable: 'Nom obsolète',
      responsableId: member.id,
      dateCreation: '2026-01-01',
      statut: 'A_FAIRE',
    });
    const html = documentHtml(meeting, config, 'pv', [action], [member]);
    expect(html).toContain('Milo');
    expect(html).not.toContain('Nom obsolète');
  });
  it('la convocation invite à participer et place le rappel de présence après l’ordre du jour', () => {
    const meeting = { ...newMeeting(), participants: [participant] };
    const config = configSchema.parse({ schemaVersion: 1, association: 'Crèche' });
    const html = documentHtml(meeting, config, 'convocation', [], [member]);
    expect(html).toContain('Vous êtes convié(e) à participer à cette réunion de l’association.');
    expect(html).toContain(
      'Cette réunion sera l’occasion de faire le point sur les différents sujets concernant la vie et le fonctionnement de l’association',
    );
    const reminder = 'Votre présence est vivement souhaitée';
    const agendaHeading = '<h2>Ordre du jour prévu</h2>';
    expect(html).toContain(reminder);
    expect(html.indexOf(agendaHeading)).toBeLessThan(html.indexOf(reminder));
    for (const kind of ['pv', 'ordre-du-jour'])
      expect(documentHtml(meeting, config, kind, [], [member])).not.toContain(reminder);
  });
});
