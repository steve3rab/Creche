<script setup lang="ts">
import { computed } from 'vue';
import { state } from '../composables/app';
import {
  labels,
  meetingStatuses,
  meetingTypes,
  actionStatuses,
  categories,
  noteImportance,
  noteImportanceLabels,
  overdue,
  today,
  dayDelta,
} from '../domain/models';

type Bar = { key: string; label: string; count: number; pct: number };

function bars<T extends string>(
  counts: Partial<Record<T, number>>,
  order: readonly T[],
  labelFor: (key: T) => string = (key) => key,
): Bar[] {
  const max = Math.max(1, ...order.map((key) => counts[key] || 0));
  return order
    .map((key) => ({ key, label: labelFor(key), count: counts[key] || 0, pct: 0 }))
    .filter((row) => row.count > 0)
    .map((row) => ({ ...row, pct: Math.round((row.count / max) * 100) }));
}
function topBars(counts: Partial<Record<string, number>>, limit = 8): Bar[] {
  const entries = Object.entries(counts) as [string, number][];
  const max = Math.max(1, ...entries.map(([, count]) => count));
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, label: key, count, pct: Math.round((count / max) * 100) }));
}
function countBy<T, K extends string>(items: T[], key: (item: T) => K): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const activeMeetings = computed(() => state.meetings.filter((m) => !m.archive));
const attendanceRate = computed(() => {
  const closed = activeMeetings.value.filter((m) => m.pvValideLe);
  let present = 0,
    total = 0;
  for (const m of closed)
    for (const p of m.participants) {
      total++;
      if (p.etat === 'PRESENT' || p.etat === 'PROCURATION') present++;
    }
  return total ? Math.round((present / total) * 100) : null;
});
const overdueActions = computed(() => state.actions.filter((a) => overdue(a)).length);
const actionCompletionRate = computed(() => {
  if (!state.actions.length) return null;
  const done = state.actions.filter((a) => a.statut === 'TERMINE').length;
  return Math.round((done / state.actions.length) * 100);
});
const activeMembersCount = computed(() => state.members.filter((m) => m.actif).length);
const totalDocumentSize = computed(() => state.documents.reduce((sum, d) => sum + d.taille, 0));
const thisMonthShifts = computed(
  () => state.planning.filter((s) => s.date.slice(0, 7) === today().slice(0, 7)).length,
);
const upcomingEvents = computed(
  () =>
    state.events.filter((e) => !e.termine && dayDelta(e.dateFin) >= 0 && dayDelta(e.dateFin) <= 30)
      .length,
);

const panels = computed(() => [
  {
    title: 'Réunions par statut',
    bars: bars(
      countBy(activeMeetings.value, (m) => m.statut),
      meetingStatuses,
      (k) => labels[k],
    ),
  },
  {
    title: 'Réunions par type',
    bars: bars(
      countBy(
        activeMeetings.value.flatMap((m) =>
          m.typeSecondaire ? [m.type, m.typeSecondaire] : [m.type],
        ),
        (t) => t,
      ),
      meetingTypes,
      (k) => labels[k],
    ),
  },
  {
    title: 'Actions par statut',
    bars: bars(
      countBy(state.actions, (a) => a.statut),
      actionStatuses,
      (k) => labels[k],
    ),
  },
  {
    title: 'Membres actifs par fonction',
    bars: topBars(
      countBy(
        state.members.filter((m) => m.actif),
        (m) => m.fonction,
      ),
    ),
  },
  {
    title: 'Documents par catégorie',
    bars: bars(
      countBy(
        state.documents.filter((d) => !d.archive),
        (d) => d.categorie,
      ),
      categories,
      (k) => labels[k],
    ),
  },
  {
    title: 'Garde : créneaux par responsable',
    bars: topBars(countBy(state.planning, (s) => s.membre || 'Non attribué')),
  },
  {
    title: 'Notes par importance',
    bars: bars(
      countBy(state.notes, (n) => n.importance),
      noteImportance,
      (k) => noteImportanceLabels[k],
    ),
  },
]);
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">CE QUE DISENT LES DONNÉES</span>
      <h1>Statistiques</h1>
      <p class="muted">Un coup d’œil exploitable sur la vie de l’association.</p>
    </div>
  </div>
  <div class="kpi-tiles">
    <div class="kpi-tile">
      <span class="kpi-tile-value">{{ activeMeetings.length }}</span>
      <span class="kpi-tile-label">Réunions actives</span>
    </div>
    <div class="kpi-tile">
      <span class="kpi-tile-value">{{
        attendanceRate === null ? '—' : attendanceRate + ' %'
      }}</span>
      <span class="kpi-tile-label">Présence moyenne (PV clôturés)</span>
    </div>
    <div class="kpi-tile" :class="{ warning: overdueActions > 0 }">
      <span class="kpi-tile-value">{{ overdueActions }}</span>
      <span class="kpi-tile-label">Actions en retard</span>
    </div>
    <div class="kpi-tile">
      <span class="kpi-tile-value">{{
        actionCompletionRate === null ? '—' : actionCompletionRate + ' %'
      }}</span>
      <span class="kpi-tile-label">Actions terminées</span>
    </div>
    <div class="kpi-tile">
      <span class="kpi-tile-value">{{ activeMembersCount }}</span>
      <span class="kpi-tile-label">Membres actifs</span>
    </div>
    <div class="kpi-tile">
      <span class="kpi-tile-value">{{ formatSize(totalDocumentSize) }}</span>
      <span class="kpi-tile-label">Documents ({{ state.documents.length }})</span>
    </div>
    <div class="kpi-tile">
      <span class="kpi-tile-value">{{ thisMonthShifts }}</span>
      <span class="kpi-tile-label">Créneaux de garde ce mois-ci</span>
    </div>
    <div class="kpi-tile">
      <span class="kpi-tile-value">{{ upcomingEvents }}</span>
      <span class="kpi-tile-label">Échéances dans les 30 jours</span>
    </div>
  </div>
  <div class="kpi-grid">
    <section v-for="panel in panels" :key="panel.title" class="panel kpi-panel">
      <h2>{{ panel.title }}</h2>
      <div v-if="panel.bars.length" class="kpi-bars">
        <div v-for="row in panel.bars" :key="row.key" class="kpi-bar-row">
          <span class="kpi-bar-label" :title="row.label">{{ row.label }}</span>
          <div class="kpi-bar-track">
            <div class="kpi-bar-fill" :style="{ width: row.pct + '%' }" />
          </div>
          <span class="kpi-bar-value">{{ row.count }}</span>
        </div>
      </div>
      <p v-else class="empty">Pas encore de données.</p>
    </section>
  </div>
</template>
