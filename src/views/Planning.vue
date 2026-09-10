<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-vue-next';
import { askConfirmation } from '../composables/confirmation';
import { state, run, refresh } from '../composables/app';
import { api } from '../services/api';
import { newBase, today, dateSchema, prettyDate, shiftSchema, type Shift } from '../domain/models';
import Modal from '../components/Modal.vue';
const route = useRoute();

function dateValue(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(date: string, n: number) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dateValue(d);
}
function mondayOf(date: string) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateValue(d);
}
const requestedDate = dateSchema.safeParse(route.query.date);
const weekStart = ref(mondayOf(requestedDate.success ? requestedDate.data : today()));
function changeWeek(delta: number) {
  weekStart.value = addDays(weekStart.value, delta * 7);
}
function goToday() {
  weekStart.value = mondayOf(today());
}
const dayLabels = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
function shortDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}
const days = computed(() =>
  dayLabels.map((label, i) => {
    const date = addDays(weekStart.value, i);
    return {
      date,
      label,
      dateLabel: shortDate(date),
      shifts: state.planning
        .filter((s) => s.date === date)
        .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut)),
    };
  }),
);
const weekLabel = computed(
  () => `${prettyDate(weekStart.value)} → ${prettyDate(addDays(weekStart.value, 6))}`,
);
const draft = ref<Shift | null>(null),
  isNew = ref(false),
  error = ref('');
const memberChoices = computed(() => {
  const currentId = draft.value?.membreId || '';
  const list = state.members.filter((m) => m.actif);
  const current = currentId ? state.members.find((m) => m.id === currentId && !m.actif) : undefined;
  return current
    ? [...list, current].sort((a, b) => a.nomComplet.localeCompare(b.nomComplet, 'fr'))
    : list;
});
function setMember(memberId: string) {
  if (!draft.value) return;
  const member = state.members.find((m) => m.id === memberId);
  draft.value.membreId = memberId;
  draft.value.membre = member ? member.nomComplet : '';
}
function create(date: string) {
  isNew.value = true;
  error.value = '';
  draft.value = {
    ...newBase(),
    date,
    heureDebut: '08:00',
    heureFin: '18:00',
    membreId: '',
    membre: '',
    notes: '',
  };
}
function edit(shift: Shift) {
  isNew.value = false;
  error.value = '';
  draft.value = { ...shift };
}
async function save() {
  if (!draft.value) return;
  const result = shiftSchema.safeParse(draft.value);
  if (!result.success) {
    error.value = result.error.issues
      .map((issue) =>
        issue.path[0] === 'membreId'
          ? 'Choisissez la personne responsable de ce créneau.'
          : issue.message,
      )
      .join(' ');
    return;
  }
  await run(async () => {
    await api(
      '/planning' + (isNew.value ? '' : '/' + result.data.id),
      isNew.value ? 'POST' : 'PUT',
      result.data,
    );
    draft.value = null;
    await refresh();
  }, 'Créneau enregistré');
}
async function remove() {
  if (!draft.value || isNew.value) return;
  if (!(await askConfirmation('Déplacer ce créneau dans la corbeille ?'))) return;
  const removedId = draft.value.id;
  await run(async () => {
    await api('/planning/' + removedId, 'DELETE', { confirm: true });
    draft.value = null;
    await refresh();
  }, 'Créneau déplacé dans la corbeille');
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">ORGANISER LA GARDE</span>
      <h1>Planning</h1>
      <p class="muted">Qui est responsable, et quand.</p>
    </div>
    <button class="primary" :disabled="state.busy" @click="create(today())">
      <Plus :size="16" />Créneau
    </button>
  </div>
  <div class="month-toolbar">
    <button
      aria-label="Semaine précédente"
      title="Semaine précédente"
      class="icon-button"
      @click="changeWeek(-1)"
    >
      <ChevronLeft :size="18" />
    </button>
    <h2>{{ weekLabel }}</h2>
    <button
      aria-label="Semaine suivante"
      title="Semaine suivante"
      class="icon-button"
      @click="changeWeek(1)"
    >
      <ChevronRight :size="18" /></button
    ><button class="quiet-link push-right" @click="goToday">Aujourd’hui</button>
  </div>
  <div class="week-grid">
    <div
      v-for="day in days"
      :key="day.date"
      class="week-day"
      :class="{ 'is-today': day.date === today() }"
    >
      <header class="week-day-header">
        <strong>{{ day.label }}</strong
        ><span class="muted">{{ day.dateLabel }}</span>
      </header>
      <button v-for="shift in day.shifts" :key="shift.id" class="shift-card" @click="edit(shift)">
        <span class="shift-time">{{ shift.heureDebut }}–{{ shift.heureFin }}</span>
        <span class="shift-member">{{ shift.membre || 'Non attribué' }}</span>
      </button>
      <button class="shift-add" @click="create(day.date)"><Plus :size="12" />Ajouter</button>
    </div>
  </div>
  <p v-if="!state.planning.length" class="panel empty large">
    Ajoutez le premier créneau de garde.
  </p>
  <Modal
    v-if="draft"
    :title="isNew ? 'Nouveau créneau' : 'Modifier le créneau'"
    @close="draft = null"
  >
    <form class="form-grid" @submit.prevent="save">
      <p v-if="error" role="alert" class="error full">{{ error }}</p>
      <label>Date<input v-model="draft.date" type="date" required /></label>
      <label
        >Responsable<select
          :value="draft.membreId"
          required
          aria-label="Responsable"
          @change="setMember(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Choisir un membre</option>
          <option v-for="m in memberChoices" :key="m.id" :value="m.id">
            {{ m.nomComplet }}
          </option>
        </select></label
      >
      <label>Heure de début<input v-model="draft.heureDebut" type="time" required /></label>
      <label>Heure de fin<input v-model="draft.heureFin" type="time" required /></label>
      <label class="full">Notes<textarea v-model="draft.notes" rows="2" /></label>
      <footer class="full">
        <button v-if="!isNew" type="button" class="danger secondary" @click="remove">
          Supprimer</button
        ><button type="submit" class="primary" :disabled="state.busy">Enregistrer</button>
      </footer>
    </form>
  </Modal>
</template>
