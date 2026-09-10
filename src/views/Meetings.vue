<script setup lang="ts">
import { askConfirmation } from '../composables/confirmation';
import { ref, computed } from 'vue';
import { Plus, ArrowUpRight } from 'lucide-vue-next';
import { state, run, refresh } from '../composables/app';
import {
  sortMeetings,
  today,
  labels,
  meetingTypes,
  meetingTypeLabel,
  meetingDisplayTitle,
  meetingStatuses,
  prettyDate,
} from '../domain/models';
import IconButton from '../components/IconButton.vue';
import { api } from '../services/api';
async function archiveMeeting(id: string, archive: boolean) {
  await run(
    async () => {
      await api('/reunions/' + id + '/archive', 'POST', { archive });
      await refresh();
    },
    archive ? 'Réunion archivée' : 'Réunion désarchivée',
  );
}
const query = ref(''),
  period = ref('avenir'),
  type = ref(''),
  status = ref('');
const rows = computed(() =>
  sortMeetings(state.meetings).filter(
    (m) =>
      (period.value === 'archives'
        ? m.archive
        : !m.archive && (period.value === 'avenir' ? m.date >= today() : m.date < today())) &&
      (!type.value || m.type === type.value || m.typeSecondaire === type.value) &&
      (!status.value || m.statut === status.value) &&
      `${meetingDisplayTitle(m)} ${m.lieu}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
);
function create() {
  window.dispatchEvent(new Event('new-meeting'));
}
async function remove(id: string) {
  if (await askConfirmation('Déplacer cette réunion dans la corbeille ?'))
    await run(async () => {
      await api('/reunions/' + id, 'DELETE', { confirm: true });
      await refresh();
    }, 'Réunion déplacée dans la corbeille');
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">SE RETROUVER & DÉCIDER</span>
      <h1>Réunions</h1>
      <p class="muted">De la convocation au procès-verbal.</p>
    </div>
    <button class="primary" @click="create"><Plus :size="16" /> Réunion</button>
  </div>
  <div class="tabs">
    <button
      v-for="[v, t] in [
        ['avenir', 'À venir'],
        ['passees', 'Passées'],
        ['archives', 'Archivées'],
      ]"
      :key="v"
      :class="{ selected: period === v }"
      @click="period = v"
    >
      {{ t }}
    </button>
  </div>
  <div class="filters">
    <input
      v-model="query"
      aria-label="Rechercher une réunion"
      placeholder="Rechercher une réunion…"
    /><select v-model="type" aria-label="Type de réunion">
      <option value="">Tous les types</option>
      <option v-for="t in meetingTypes" :key="t" :value="t">{{ t }}</option></select
    ><select v-model="status" aria-label="Statut de réunion">
      <option value="">Tous les statuts</option>
      <option v-for="s in meetingStatuses" :key="s" :value="s">{{ labels[s] }}</option>
    </select>
  </div>
  <div class="stack">
    <article v-for="m in rows" :key="m.id" class="list-card">
      <div class="date-tile">
        {{ m.date.slice(8)
        }}<small>{{
          new Date(m.date + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'short' })
        }}</small>
      </div>
      <RouterLink class="grow" :to="'/reunions/' + m.id"
        ><strong>{{ meetingDisplayTitle(m) }}</strong
        ><small
          >{{ meetingTypeLabel(m, true) }} · {{ prettyDate(m.date) }} · {{ m.heureDebut }} ·
          {{ m.lieu || 'Lieu à préciser' }}</small
        ></RouterLink
      ><span class="badge">{{ labels[m.statut] }}</span
      ><IconButton
        :label="m.archive ? 'Désarchiver la réunion' : 'Archiver la réunion'"
        icon="archive"
        @click="archiveMeeting(m.id, !m.archive)"
      /><IconButton
        label="Supprimer la réunion"
        icon="delete"
        :disabled="!!m.pvValideLe"
        @click="remove(m.id)"
      /><RouterLink
        :to="'/reunions/' + m.id"
        aria-label="Ouvrir la réunion"
        title="Ouvrir la réunion"
        ><ArrowUpRight :size="17"
      /></RouterLink>
    </article>
    <div v-if="!rows.length" class="panel empty large">
      <h3>Aucune réunion ici pour le moment.</h3>
      <p>Préparez la prochaine rencontre de l’association.</p>
      <button class="secondary" @click="create">+ Créer une réunion</button>
    </div>
  </div>
</template>
