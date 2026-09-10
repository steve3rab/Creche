<script setup lang="ts">
import { askConfirmation } from '../composables/confirmation';
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { state, run, refresh } from '../composables/app';
import { api } from '../services/api';
import {
  newBase,
  today,
  labels,
  actionStatuses,
  roles,
  eventTypes,
  prettyDate,
  sortEvents,
  dayDelta,
  eventContainsDate,
  eventDueLabel,
  eventDateLabel,
  eventCategoryClass,
  meetingDisplayTitle,
  memberSchema,
  actionSchema,
  eventSchema,
  type Member,
  type Action,
  type AgendaEvent,
} from '../domain/models';
import Modal from '../components/Modal.vue';
import IconButton from '../components/IconButton.vue';
import Calendar from '../components/Calendar.vue';
import YearCalendar from '../components/YearCalendar.vue';
import ActionList from '../components/ActionList.vue';
const props = defineProps<{ kind: 'membres' | 'actions' | 'agenda' }>();
const route = useRoute(),
  router = useRouter();
const query = ref(String(route.query.q || '')),
  filter = ref(''),
  view = ref<'Jour' | 'Mois' | 'Année' | 'Liste'>(route.query.q ? 'Liste' : 'Mois'),
  calendarDate = ref(today()),
  draft = ref<Record<string, string | number | boolean> | null>(null),
  isNew = ref(false),
  formError = ref('');
const title = computed(
    () => ({ membres: 'Membres', actions: 'Actions', agenda: 'Agenda' })[props.kind],
  ),
  singular = computed(
    () => ({ membres: 'un membre', actions: 'une action', agenda: 'une date' })[props.kind],
  );
const fields = computed(() =>
  props.kind === 'membres'
    ? [
        { key: 'nomComplet', label: 'Nom et prénom', required: true },
        { key: 'prenomEnfant', label: 'Prénom de l’enfant (facultatif)' },
        { key: 'fonction', label: 'Fonction', options: roles },
        { key: 'email', label: 'E-mail', type: 'email' },
        { key: 'telephone', label: 'Téléphone' },
        { key: 'actif', label: 'Membre actif', type: 'checkbox' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]
    : props.kind === 'actions'
      ? [
          { key: 'titre', label: 'Titre', required: true },
          { key: 'responsable', label: 'Responsable' },
          { key: 'echeance', label: 'Échéance', type: 'date' },
          { key: 'statut', label: 'Statut', options: [...actionStatuses] },
          { key: 'description', label: 'Description', type: 'textarea' },
        ]
      : [
          { key: 'titre', label: 'Titre', required: true },
          { key: 'date', label: 'Date de début', type: 'date', required: true },
          { key: 'dateFin', label: 'Date de fin', type: 'date', required: true },
          { key: 'heure', label: 'Heure', type: 'time' },
          { key: 'categorie', label: 'Catégorie', options: [...eventTypes] },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'termine', label: 'Terminé', type: 'checkbox' },
        ],
);
function create() {
  isNew.value = true;
  formError.value = '';
  draft.value = {
    ...newBase(),
    ...(props.kind === 'membres'
      ? { nomComplet: '', prenomEnfant: '', fonction: 'Membre', actif: true }
      : props.kind === 'actions'
        ? {
            titre: '',
            responsable: '',
            responsableId: '',
            echeance: '',
            dateCreation: today(),
            statut: 'A_FAIRE',
            description: '',
          }
        : {
            titre: '',
            date: today(),
            dateFin: today(),
            heure: '',
            categorie: 'Autre',
            reunionId: '',
            actionId: '',
            description: '',
            termine: false,
          }),
  };
}
const responsableChoices = computed(() => {
  const active = state.members.filter((m) => m.actif);
  const currentId =
    draft.value && typeof draft.value.responsableId === 'string' ? draft.value.responsableId : '';
  const current = currentId ? state.members.find((m) => m.id === currentId && !m.actif) : undefined;
  return current
    ? [...active, current].sort((a, b) => a.nomComplet.localeCompare(b.nomComplet, 'fr'))
    : active;
});
function setResponsable(memberId: string) {
  if (!draft.value) return;
  const member = state.members.find((m) => m.id === memberId);
  draft.value.responsableId = memberId;
  draft.value.responsable = member ? member.nomComplet : '';
}
function edit(item: Member | Action | AgendaEvent) {
  if ('categorie' in item && item.id.startsWith('meeting-')) {
    void router.push('/reunions/' + item.reunionId);
    return;
  }
  if ('categorie' in item && item.id.startsWith('action-')) {
    void router.push('/actions?q=' + encodeURIComponent(item.titre));
    return;
  }
  isNew.value = false;
  formError.value = '';
  draft.value = JSON.parse(JSON.stringify(item)) as Record<string, string | number | boolean>;
}
async function save() {
  if (!draft.value) return;
  const schema = { membres: memberSchema, actions: actionSchema, agenda: eventSchema }[props.kind],
    result = schema.safeParse(draft.value);
  if (!result.success) {
    formError.value = result.error.issues
      .map((i) => `${i.path.join('.')} : ${i.message}`)
      .join(' · ');
    return;
  }
  await run(async () => {
    await api(
      '/' + props.kind + (isNew.value ? '' : '/' + result.data.id),
      isNew.value ? 'POST' : 'PUT',
      result.data,
    );
    draft.value = null;
    await refresh();
  }, 'Enregistré');
}
async function remove(id: string) {
  if (!(await askConfirmation('Déplacer cet élément dans la corbeille ?'))) return;
  await run(async () => {
    await api('/' + props.kind + '/' + id, 'DELETE', { confirm: true });
    draft.value = null;
    await refresh();
  }, 'Déplacé dans la corbeille');
}
const activeCount = computed(() => state.members.filter((member) => member.actif).length);
const inactiveCount = computed(() => state.members.length - activeCount.value);
const members = computed(() =>
  state.members.filter(
    (m) =>
      (!filter.value || String(m.actif) === filter.value) &&
      `${m.nomComplet} ${m.prenomEnfant} ${m.fonction}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
  ),
);
const actions = computed(() =>
  state.actions.filter(
    (a) =>
      (!filter.value || a.statut === filter.value) &&
      `${a.titre} ${a.description} ${a.responsable}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
  ),
);
const events = computed(() =>
  sortEvents(
    [
      ...state.events,
      ...state.meetings
        .filter((m) => !m.archive)
        .map((m) => ({
          ...newBase(),
          id: 'meeting-' + m.id,
          titre: meetingDisplayTitle(m),
          date: m.date,
          dateFin: m.date,
          heure: m.heureDebut,
          categorie: 'Réunion' as const,
          description: m.lieu,
          reunionId: m.id,
          actionId: '',
          termine: m.statut === 'CLOTUREE',
        })),
      ...state.actions
        .filter((a) => a.echeance)
        .map((a) => ({
          ...newBase(),
          id: 'action-' + a.id,
          titre: a.titre,
          date: a.echeance,
          dateFin: a.echeance,
          heure: '',
          categorie: 'Action' as const,
          description: a.description,
          reunionId: '',
          actionId: a.id,
          termine: ['TERMINE', 'ANNULE'].includes(a.statut),
        })),
    ].filter((e) =>
      `${e.titre} ${e.description}`.toLowerCase().includes(query.value.toLowerCase()),
    ),
  ),
);
const groups = computed(() => {
  const now = new Date(today() + 'T12:00:00');
  const endWeek = 6 - ((now.getDay() + 6) % 7);
  const categorize = (e: AgendaEvent) => {
    if (eventContainsDate(e, today())) return 'Aujourd’hui';
    const n = dayDelta(e.date);
    return n < 0
      ? 'Dates passées'
      : n === 0
        ? 'Aujourd’hui'
        : n <= endWeek
          ? 'Cette semaine'
          : e.date.slice(0, 7) === today().slice(0, 7)
            ? 'Ce mois'
            : 'Plus tard';
  };
  return ['Aujourd’hui', 'Cette semaine', 'Ce mois', 'Plus tard', 'Dates passées']
    .map((label) => ({ label, rows: events.value.filter((e) => categorize(e) === label) }))
    .filter((g) => g.rows.length);
});
const month = computed(() => calendarDate.value.slice(0, 7));
const year = computed(() => Number(calendarDate.value.slice(0, 4)));
const dayEvents = computed(() =>
  events.value.filter((event) => eventContainsDate(event, calendarDate.value)),
);
function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function changeDay(delta: number) {
  const date = new Date(calendarDate.value + 'T12:00:00');
  date.setDate(date.getDate() + delta);
  calendarDate.value = dateValue(date);
}
function changeMonth(delta: number) {
  const [y, m] = month.value.split('-').map(Number),
    d = new Date(y, m - 1 + delta, 1);
  calendarDate.value = dateValue(d);
}
function changeYear(delta: number) {
  calendarDate.value = `${year.value + delta}-01-01`;
}
function selectDay(date: string) {
  calendarDate.value = date;
  view.value = 'Jour';
}
function saveShortcut() {
  if (draft.value) void save();
}
onMounted(() => document.addEventListener('app-save', saveShortcut));
onBeforeUnmount(() => document.removeEventListener('app-save', saveShortcut));
watch(
  () => route.query.q,
  (q) => (query.value = String(q || '')),
);
watch(
  () => draft.value?.date,
  (date, previous) => {
    if (
      props.kind === 'agenda' &&
      draft.value &&
      typeof date === 'string' &&
      previous !== undefined &&
      (draft.value.dateFin === previous || String(draft.value.dateFin) < date)
    )
      draft.value.dateFin = date;
  },
);
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">{{
        kind === 'agenda'
          ? 'GARDER LE FIL'
          : kind === 'membres'
            ? 'FAIRE ASSOCIATION'
            : 'PASSER À L’ACTION'
      }}</span>
      <h1>{{ title }}</h1>
      <p v-if="kind === 'membres'" class="muted member-counts">
        {{ activeCount }} actif{{ activeCount === 1 ? '' : 's' }} · {{ inactiveCount }} inactif{{
          inactiveCount === 1 ? '' : 's'
        }}
      </p>
      <p class="muted">
        {{
          kind === 'agenda'
            ? 'Les dates à ne pas oublier.'
            : kind === 'membres'
              ? 'Les personnes qui font vivre l’association.'
              : 'Les décisions prennent leur suite ici.'
        }}
      </p>
    </div>
    <button class="primary" @click="create">
      <Plus :size="16" />{{
        kind === 'membres' ? 'Membre' : kind === 'agenda' ? 'Date importante' : 'Action'
      }}
    </button>
  </div>
  <div class="filters">
    <input
      v-model="query"
      :aria-label="'Rechercher dans ' + title"
      placeholder="Rechercher…"
    /><select v-if="kind === 'membres'" v-model="filter" aria-label="Filtrer les membres">
      <option value="">Tous les membres ({{ state.members.length }})</option>
      <option value="true">Actifs ({{ state.members.filter((m) => m.actif).length }})</option>
      <option value="false">
        Inactifs ({{ state.members.filter((m) => !m.actif).length }})
      </option></select
    ><select v-if="kind === 'actions'" v-model="filter" aria-label="Filtrer les actions">
      <option value="">Tous les statuts</option>
      <option v-for="s in actionStatuses" :key="s" :value="s">{{ labels[s] }}</option>
    </select>
    <div v-if="kind === 'agenda'" class="segmented">
      <button
        v-for="v in ['Jour', 'Mois', 'Année', 'Liste']"
        :key="v"
        :class="{ selected: view === v }"
        @click="view = v"
      >
        {{ v }}
      </button>
    </div>
  </div>
  <template v-if="kind === 'membres'"
    ><article v-for="m in members" :key="m.id" class="list-card member-card">
      <div class="avatar">
        {{
          m.nomComplet
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((n) => n[0])
            .join('')
        }}
      </div>
      <div class="grow">
        <strong>{{ m.nomComplet }}</strong
        ><small>{{ m.fonction }} · {{ m.email || 'Pas d’e-mail' }}</small>
        <small v-if="m.prenomEnfant">Enfant : {{ m.prenomEnfant }}</small>
      </div>
      <span class="badge">{{ m.actif ? 'Actif' : 'Inactif' }}</span
      ><IconButton label="Modifier le membre" @click="edit(m)" /><IconButton
        label="Supprimer le membre"
        icon="delete"
        @click="remove(m.id)"
      />
    </article>
    <p v-if="!members.length" class="panel empty large">
      Ajoutez le premier membre de l’association.
    </p></template
  ><ActionList v-if="kind === 'actions'" :actions="actions" @edit="edit" /><template
    v-if="kind === 'agenda'"
    ><template v-if="view === 'Jour'"
      ><div class="month-toolbar">
        <button
          aria-label="Jour précédent"
          title="Jour précédent"
          class="icon-button"
          @click="changeDay(-1)"
        >
          <ChevronLeft :size="18" />
        </button>
        <h2>{{ prettyDate(calendarDate) }}</h2>
        <button
          aria-label="Jour suivant"
          title="Jour suivant"
          class="icon-button"
          @click="changeDay(1)"
        >
          <ChevronRight :size="18" />
        </button>
        <button class="quiet-link push-right" @click="calendarDate = today()">Aujourd’hui</button>
      </div>
      <section class="day-agenda panel">
        <button
          v-for="event in dayEvents"
          :key="event.id"
          class="day-agenda-row"
          :class="eventCategoryClass(event.categorie)"
          @click="edit(event)"
        >
          <time>{{ event.heure || 'Toute la journée' }}</time>
          <span
            ><strong>{{ event.titre }}</strong
            ><small
              >{{ event.categorie }} · {{ event.description || 'Sans précision' }}</small
            ></span
          >
        </button>
        <p v-if="!dayEvents.length" class="empty">Aucune date à afficher ce jour.</p>
      </section></template
    ><template v-else-if="view === 'Mois'"
      ><div class="month-toolbar">
        <button
          aria-label="Mois précédent"
          title="Mois précédent"
          class="icon-button"
          @click="changeMonth(-1)"
        >
          <ChevronLeft :size="18" />
        </button>
        <h2>
          {{
            new Date(month + '-01T12:00:00').toLocaleDateString('fr-FR', {
              month: 'long',
              year: 'numeric',
            })
          }}
        </h2>
        <button
          aria-label="Mois suivant"
          title="Mois suivant"
          class="icon-button"
          @click="changeMonth(1)"
        >
          <ChevronRight :size="18" /></button
        ><button class="quiet-link push-right" @click="calendarDate = today()">Aujourd’hui</button>
      </div>
      <Calendar :month="month" :events="events" @select="edit" /></template
    ><template v-else-if="view === 'Année'"
      ><div class="month-toolbar">
        <button
          aria-label="Année précédente"
          title="Année précédente"
          class="icon-button"
          @click="changeYear(-1)"
        >
          <ChevronLeft :size="18" />
        </button>
        <h2>{{ year }}</h2>
        <button
          aria-label="Année suivante"
          title="Année suivante"
          class="icon-button"
          @click="changeYear(1)"
        >
          <ChevronRight :size="18" />
        </button>
        <button class="quiet-link push-right" @click="calendarDate = today()">Aujourd’hui</button>
      </div>
      <YearCalendar :year="year" :events="events" @select-day="selectDay" /></template
    ><template v-else
      ><section v-for="group in groups" :key="group.label" class="agenda-group">
        <h2>{{ group.label }}</h2>
        <button
          v-for="e in group.rows"
          :key="e.id"
          class="list-card"
          :class="eventCategoryClass(e.categorie)"
          @click="edit(e)"
        >
          <span class="grow"
            ><strong>{{ e.titre }}</strong
            ><small>{{ eventDateLabel(e) }} {{ e.heure }} · {{ e.categorie }}</small></span
          ><span class="badge" :class="{ warning: eventDueLabel(e) === 'En retard' }">{{
            eventDueLabel(e)
          }}</span>
        </button>
      </section>
      <p v-if="!groups.length" class="empty">Aucune date à afficher.</p></template
    ></template
  ><Modal v-if="draft" :title="(isNew ? 'Ajouter ' : 'Modifier ') + singular" @close="draft = null"
    ><form class="form-grid" @submit.prevent="save">
      <label
        v-for="field in fields"
        :key="field.key"
        :class="{
          full: field.type === 'textarea' || field.key === 'titre',
          checkbox: field.type === 'checkbox',
        }"
        >{{ field.label
        }}<select
          v-if="field.key === 'responsable'"
          :value="draft.responsableId"
          aria-label="Responsable"
          @change="setResponsable(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Non attribué</option>
          <option v-for="m in responsableChoices" :key="m.id" :value="m.id">
            {{ m.nomComplet }}
          </option></select
        ><select v-else-if="field.options" v-model="draft[field.key]" :aria-label="field.label">
          <option v-for="o in field.options" :key="o" :value="o">
            {{ labels[o] || o }}
          </option></select
        ><textarea
          v-else-if="field.type === 'textarea'"
          :value="String(draft[field.key] || '')"
          rows="2"
          @input="draft[field.key] = ($event.target as HTMLTextAreaElement).value" /><input
          v-else-if="field.type === 'checkbox'"
          v-model="draft[field.key]"
          type="checkbox" /><input
          v-else
          v-model="draft[field.key]"
          :type="field.type || 'text'"
          :required="field.required"
          :min="field.key === 'dateFin' ? String(draft.date) : undefined"
          :maxlength="field.type ? undefined : 240"
      /></label>
      <div v-if="kind === 'agenda'" class="form-grid full event-links">
        <label
          >Lié à une réunion<select v-model="draft.reunionId" aria-label="Lié à une réunion">
            <option value="">Aucune</option>
            <option v-for="m in state.meetings" :key="m.id" :value="m.id">
              {{ meetingDisplayTitle(m) }}
            </option>
          </select></label
        ><label
          >Lié à une action<select v-model="draft.actionId" aria-label="Lié à une action">
            <option value="">Aucune</option>
            <option v-for="a in state.actions" :key="a.id" :value="a.id">{{ a.titre }}</option>
          </select></label
        >
      </div>
      <RouterLink
        v-if="kind === 'actions' && draft.reunionSource"
        :to="'/reunions/' + draft.reunionSource"
        class="full text-link"
        >Ouvrir la réunion source</RouterLink
      >
      <RouterLink
        v-if="kind === 'actions' && draft.noteSource"
        :to="'/notes?id=' + draft.noteSource"
        class="full text-link"
        >Ouvrir la note source</RouterLink
      >
      <p v-if="formError" role="alert" class="error full">{{ formError }}</p>
      <footer class="full">
        <button
          v-if="!isNew"
          type="button"
          class="danger secondary"
          @click="remove(String(draft.id))"
        >
          Supprimer</button
        ><button type="submit" class="primary" :disabled="state.busy">Enregistrer</button>
      </footer>
    </form></Modal
  >
</template>
