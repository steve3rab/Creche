<script setup lang="ts">
import type { Participant, Member } from '../domain/models';
import { computed } from 'vue';
import { memberChoice, participantChoice } from '../domain/participants';
import IconButton from './IconButton.vue';
const rows = defineModel<Participant[]>({ required: true });
const props = withDefaults(
  defineProps<{ members: Member[]; disabled?: boolean; attendance?: boolean }>(),
  { attendance: true },
);
const available = computed(() =>
  props.members.filter((m) => m.actif && !rows.value.some((p) => p.membreId === m.id)),
);
function addMember(m: Member) {
  if (props.disabled || !m.actif || rows.value.some((p) => p.membreId === m.id)) return;
  rows.value.push({
    membreId: m.id,
    nom: m.nomComplet,
    prenomEnfant: m.prenomEnfant,
    etat: 'PRESENT',
    mandataire: '',
    mandataireId: '',
  });
}
function addAll() {
  // Two parents of the same child both appear as the child's name; adding both is
  // just a duplicate reference to that child, so only the first one is added.
  const children = new Set(rows.value.map((p) => p.prenomEnfant).filter(Boolean));
  for (const member of available.value) {
    if (member.prenomEnfant && children.has(member.prenomEnfant)) continue;
    addMember(member);
    if (member.prenomEnfant) children.add(member.prenomEnfant);
  }
}
function setProxy(p: Participant, event: Event) {
  p.mandataireId = (event.target as HTMLSelectElement).value;
  p.mandataire = rows.value.find((row) => row.membreId === p.mandataireId)?.nom || '';
}
function add(e: Event, members: Member[]) {
  const el = e.target as HTMLSelectElement,
    m = members.find((m) => m.id === el.value);
  if (m) addMember(m);
  el.value = '';
}
</script>
<template>
  <div class="stack">
    <div class="row wrap participant-add">
      <select
        aria-label="Ajouter un participant"
        :disabled="disabled"
        @change="add($event, members)"
      >
        <option value="">+ Ajouter un membre</option>
        <option v-for="m in available" :key="m.id" :value="m.id">
          {{ memberChoice(m) }}
        </option>
      </select>
      <button
        type="button"
        class="secondary"
        :disabled="disabled || !available.length"
        @click="addAll"
      >
        Ajouter tous les membres actifs
      </button>
    </div>
    <p v-if="!members.length" class="muted">Ajoutez les membres depuis la rubrique Membres.</p>
    <div
      v-for="(p, i) in rows"
      :key="p.membreId"
      class="participant"
      :class="{ 'recipient-only': !attendance }"
    >
      <strong>{{ participantChoice(p, members) }}</strong
      ><select
        v-if="attendance"
        v-model="p.etat"
        :aria-label="`Présence de ${p.nom}`"
        :disabled="disabled"
      >
        <option value="PRESENT">Présent</option>
        <option value="ABSENT">Absent</option>
        <option value="EXCUSE">Excusé</option>
        <option value="PROCURATION">Procuration</option></select
      ><select
        v-if="attendance && p.etat === 'PROCURATION'"
        :value="p.mandataireId || ''"
        aria-label="Mandataire"
        :disabled="disabled"
        @change="setProxy(p, $event)"
      >
        <option value="">
          {{ p.mandataire && !p.mandataireId ? p.mandataire : 'Choisir un mandataire' }}
        </option>
        <option
          v-for="present in rows.filter((row) => row.etat === 'PRESENT')"
          :key="present.membreId"
          :value="present.membreId"
        >
          {{ participantChoice(present, members) }}
        </option></select
      ><IconButton
        label="Retirer le participant"
        icon="delete"
        :disabled="disabled"
        @click="rows.splice(i, 1)"
      />
    </div>
  </div>
</template>
