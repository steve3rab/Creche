<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronLeft, ChevronRight, Plus, RepeatIcon } from 'lucide-vue-next';
import { askConfirmation } from '../composables/confirmation';
import { state, run, refresh } from '../composables/app';
import { api } from '../services/api';
import {
  newBase,
  today,
  dateSchema,
  prettyDate,
  shiftSchema,
  shiftTemplateSchema,
  shiftPatchSchema,
  type Shift,
} from '../domain/models';
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
function addYears(date: string, n: number) {
  const d = new Date(date + 'T12:00:00');
  d.setFullYear(d.getFullYear() + n);
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
const monthLabel = computed(() =>
  new Date(weekStart.value + 'T12:00:00').toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  }),
);
// Two parents of the same child both show up as the shift's "responsable"; displaying
// the child's name instead — the same substitution the PDFs already make — means both
// parents' shifts read as referring to the one child, not two different people.
function shiftChildName(shift: Shift) {
  const member = state.members.find((m) => m.id === shift.membreId);
  return member?.prenomEnfant || member?.nomComplet || shift.membre || 'Non attribué';
}
const draft = ref<Shift | null>(null),
  isNew = ref(false),
  error = ref(''),
  repeat = ref(false),
  until = ref(''),
  scope = ref<'occurrence' | 'suivantes'>('occurrence');
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
function setStatut(value: string) {
  if (!draft.value) return;
  draft.value.statut = value === 'PRESENT' || value === 'ABSENT' ? value : null;
}
function create(date: string) {
  isNew.value = true;
  error.value = '';
  repeat.value = false;
  until.value = addYears(date, 1);
  draft.value = {
    ...newBase(),
    date,
    heureDebut: '08:00',
    heureFin: '18:00',
    membreId: '',
    membre: '',
    notes: '',
    serieId: '',
    statut: null,
  };
}
function edit(shift: Shift) {
  isNew.value = false;
  error.value = '';
  scope.value = 'occurrence';
  draft.value = { ...shift };
}
function friendlyErrors(result: { issues: { path: PropertyKey[]; message: string }[] }) {
  return result.issues
    .map((issue) =>
      issue.path[0] === 'membreId'
        ? 'Choisissez la personne responsable de ce créneau.'
        : issue.message,
    )
    .join(' ');
}
async function save() {
  if (!draft.value) return;
  if (isNew.value && repeat.value) {
    const result = shiftTemplateSchema.safeParse({
      date: draft.value.date,
      jusquau: until.value,
      heureDebut: draft.value.heureDebut,
      heureFin: draft.value.heureFin,
      membreId: draft.value.membreId,
      membre: draft.value.membre,
      notes: draft.value.notes,
    });
    if (!result.success) {
      error.value = friendlyErrors(result.error);
      return;
    }
    await run(async () => {
      await api('/planning/serie', 'POST', result.data);
      draft.value = null;
      await refresh();
    }, 'Créneaux enregistrés pour toute la période');
    return;
  }
  if (!isNew.value && draft.value.serieId && scope.value === 'suivantes') {
    const result = shiftPatchSchema.safeParse({
      heureDebut: draft.value.heureDebut,
      heureFin: draft.value.heureFin,
      membreId: draft.value.membreId,
      membre: draft.value.membre,
      notes: draft.value.notes,
    });
    if (!result.success) {
      error.value = friendlyErrors(result.error);
      return;
    }
    const serieId = draft.value.serieId,
      fromDate = draft.value.date;
    await run(async () => {
      await api('/planning/serie/' + serieId, 'PUT', { ...result.data, fromDate });
      draft.value = null;
      await refresh();
    }, 'Créneaux mis à jour à partir de cette date');
    return;
  }
  const result = shiftSchema.safeParse(draft.value);
  if (!result.success) {
    error.value = friendlyErrors(result.error);
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
  const series = !!draft.value.serieId && scope.value === 'suivantes';
  if (
    !(await askConfirmation(
      series
        ? 'Déplacer ce créneau et tous les suivants de la série dans la corbeille ?'
        : 'Déplacer ce créneau dans la corbeille ?',
    ))
  )
    return;
  const removed = draft.value;
  await run(
    async () => {
      if (series)
        await api('/planning/serie/' + removed.serieId, 'DELETE', {
          confirm: true,
          fromDate: removed.date,
        });
      else await api('/planning/' + removed.id, 'DELETE', { confirm: true });
      draft.value = null;
      await refresh();
    },
    series ? 'Créneaux déplacés dans la corbeille' : 'Créneau déplacé dans la corbeille',
  );
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
  <p class="muted planning-month">{{ monthLabel }}</p>
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
      <button
        v-for="shift in day.shifts"
        :key="shift.id"
        class="shift-card"
        :class="{
          'shift-present': shift.statut === 'PRESENT',
          'shift-absent': shift.statut === 'ABSENT',
        }"
        @click="edit(shift)"
      >
        <span class="shift-time"
          ><RepeatIcon v-if="shift.serieId" :size="10" />{{ shift.heureDebut }}–{{
            shift.heureFin
          }}</span
        >
        <span class="shift-member">{{ shiftChildName(shift) }}</span>
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
      <label
        >Date<input v-model="draft.date" type="date" required :disabled="scope === 'suivantes'"
      /></label>
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
      <label v-if="!isNew"
        >Statut<select
          :value="draft.statut || ''"
          aria-label="Statut"
          @change="setStatut(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Non renseigné</option>
          <option value="PRESENT">Présent</option>
          <option value="ABSENT">Absent</option>
        </select></label
      >
      <label class="full">Notes<textarea v-model="draft.notes" rows="2" /></label>
      <template v-if="isNew"
        ><label class="full checkbox"
          ><input v-model="repeat" type="checkbox" /> Se répète chaque semaine, à la même heure,
          avec la même personne</label
        ><label v-if="repeat"
          >Jusqu’au<input v-model="until" type="date" required :min="draft.date"
        /></label>
        <small v-if="repeat" class="full muted"
          >Un créneau est créé chaque semaine jusqu’à cette date (deux ans au maximum). Chacun reste
          ensuite modifiable ou supprimable séparément.</small
        ></template
      >
      <template v-if="!isNew && draft.serieId"
        ><small class="full muted">Ce créneau fait partie d’une répétition hebdomadaire.</small
        ><label class="full"
          >Appliquer les changements à<select
            v-model="scope"
            aria-label="Appliquer les changements à"
          >
            <option value="occurrence">Cette occurrence seulement</option>
            <option value="suivantes">Cette occurrence et toutes les suivantes</option>
          </select></label
        ></template
      >
      <footer class="full">
        <button v-if="!isNew" type="button" class="danger secondary" @click="remove">
          Supprimer</button
        ><button type="submit" class="primary" :disabled="state.busy">Enregistrer</button>
      </footer>
    </form>
  </Modal>
</template>
