import { z } from 'zod';
import { meetingSchema, type Member, type Participant, type Meeting } from './models.js';
export function memberChoice(member: Pick<Member, 'nomComplet' | 'prenomEnfant'>) {
  return `${member.nomComplet}${member.prenomEnfant ? ` (${member.prenomEnfant})` : ''}`;
}
export function participantChoice(participant: Participant, members: Member[]) {
  const member = members.find((m) => m.id === participant.membreId);
  return memberChoice({
    nomComplet: participant.nom,
    prenomEnfant: member?.prenomEnfant || participant.prenomEnfant || '',
  });
}
export function childName(participant: Participant, members: Member[] = []) {
  return (
    participant.prenomEnfant ||
    members.find((m) => m.id === participant.membreId)?.prenomEnfant ||
    'Enfant non renseigné'
  );
}
export function votingCapacity(participants: Participant[]) {
  return new Set(
    participants
      .filter((p) => p.etat === 'PRESENT' || p.etat === 'PROCURATION')
      .map((p) => p.membreId),
  ).size;
}
export function voteErrors(meeting: Meeting) {
  const capacity = votingCapacity(meeting.participants);
  return meeting.ordreDuJour.flatMap((point, index) =>
    point.vote && point.vote.pour + point.vote.contre + point.vote.abstention > capacity
      ? [
          {
            index,
            message: `Vote du point ${index + 1} : le total ne peut pas dépasser ${capacity} voix (présents et procurations).`,
          },
        ]
      : [],
  );
}
// Keep old files readable; enforce the new voting rules on writes and PDF validation.
export const meetingWriteSchema = meetingSchema.superRefine((meeting, context) => {
  if (new Set(meeting.participants.map((p) => p.membreId)).size !== meeting.participants.length)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['participants'],
      message: 'Un membre ne peut être ajouté qu’une seule fois.',
    });
  for (const error of voteErrors(meeting))
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ordreDuJour', error.index, 'vote'],
      message: error.message,
    });
});
