<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUpRight, CalendarDays, Plus, Check, Clock3 } from 'lucide-vue-next';
import { state } from '../composables/app';
import {
  sortMeetings,
  sortEvents,
  today,
  prettyDate,
  dueLabel,
  labels,
  overdue,
  meetingTypeLabel,
  meetingDisplayTitle,
  eventDueLabel,
  eventDateLabel,
} from '../domain/models';
const next = computed(
  () => sortMeetings(state.meetings.filter((m) => !m.archive && m.date >= today()))[0],
);
const preparation = computed(() =>
  state.meetings
    .filter((m) => !m.archive && m.statut !== 'CLOTUREE')
    .flatMap((m) => [
      ...(m.date >= today() && !m.generations.convocation
        ? [{ text: 'Convocation à préparer', m }]
        : []),
      ...(m.date >= today() && !m.ordreDuJour.length
        ? [{ text: 'Ordre du jour à compléter', m }]
        : []),
      ...(['PV_A_VALIDER', 'PV_A_REDIGER'].includes(m.statut)
        ? [{ text: labels[m.statut], m }]
        : []),
    ])
    .slice(0, 3),
);
const dates = computed(() =>
  sortEvents(state.events.filter((e) => !e.termine && e.dateFin >= today())).slice(0, 3),
);
const pending = computed(() =>
  state.actions
    .filter((a) => !['TERMINE', 'ANNULE'].includes(a.statut))
    .sort((a, b) => (a.echeance || '9999').localeCompare(b.echeance || '9999'))
    .slice(0, 3),
);
function create() {
  window.dispatchEvent(new Event('new-meeting'));
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">VOTRE ESPACE ASSOCIATIF</span>
      <h1>Bonjour, {{ state.config?.secretaire?.split(' ')[0] || 'et bienvenue' }}.</h1>
      <p class="muted">L’essentiel pour avancer, tranquillement.</p>
    </div>
    <button class="primary" @click="create"><Plus :size="16" /> Réunion</button>
  </div>
  <div class="dashboard-grid">
    <section class="panel next-meeting">
      <div class="section-heading">
        <h2>Prochaine réunion</h2>
        <CalendarDays :size="18" />
      </div>
      <template v-if="next"
        ><span class="badge">{{ meetingTypeLabel(next, true) }}</span>
        <h3>{{ meetingDisplayTitle(next) }}</h3>
        <div class="meeting-date">{{ prettyDate(next.date) }}</div>
        <p class="muted">
          {{ next.heureDebut }} <span class="separator">·</span>
          {{ next.lieu || 'Lieu à préciser' }}
        </p>
        <RouterLink class="text-link" :to="'/reunions/' + next.id"
          >Préparer la réunion <ArrowUpRight :size="16" /></RouterLink
      ></template>
      <div v-else class="empty">
        <p>La prochaine rencontre<br />commence ici.</p>
        <button class="secondary" @click="create">Créer une réunion</button>
      </div>
    </section>
    <section class="panel">
      <div class="section-heading">
        <h2>À préparer</h2>
        <span class="count">{{ preparation.length }}</span>
      </div>
      <RouterLink
        v-for="(p, i) in preparation"
        :key="i"
        :to="'/reunions/' + p.m.id"
        class="prepare-row"
        ><span class="small-square"><Clock3 :size="14" /></span
        ><span
          ><strong>{{ p.text }}</strong
          ><small>{{ meetingTypeLabel(p.m, true) }} · {{ prettyDate(p.m.date) }}</small></span
        ><ArrowUpRight :size="14"
      /></RouterLink>
      <p v-if="!preparation.length" class="empty"><Check :size="25" />Tout est à jour.</p>
    </section>
    <section class="panel">
      <div class="section-heading">
        <h2>Prochaines dates</h2>
        <RouterLink to="/agenda" class="quiet-link"
          >L’agenda <ArrowUpRight :size="14"
        /></RouterLink>
      </div>
      <div v-for="e in dates" :key="e.id" class="date-row">
        <span class="date-tile"
          >{{ e.date.slice(8)
          }}<small>{{
            new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'short' })
          }}</small></span
        ><span class="grow"
          ><strong>{{ e.titre }}</strong
          ><small :title="eventDateLabel(e)">{{ e.categorie }} · {{ eventDueLabel(e) }}</small
          ><small v-if="e.date !== e.dateFin">{{ eventDateLabel(e) }}</small></span
        >
      </div>
      <p v-if="!dates.length" class="empty">Aucune échéance à venir.</p>
    </section>
    <section class="panel">
      <div class="section-heading">
        <h2>Actions en attente</h2>
        <RouterLink to="/actions" class="quiet-link"
          >Tout voir <ArrowUpRight :size="14"
        /></RouterLink>
      </div>
      <RouterLink v-for="a in pending" :key="a.id" to="/actions" class="pending-row"
        ><span class="check-outline" /><span
          ><strong>{{ a.titre }}</strong
          ><small :class="{ warningText: overdue(a) }"
            >{{ a.responsable || 'Non attribuée' }} · {{ dueLabel(a.echeance) }}</small
          ></span
        ></RouterLink
      >
      <p v-if="!pending.length" class="empty">Vous n’avez aucune action en attente.</p>
    </section>
  </div>
  <div class="page-note">
    <span class="green-dot" /> Vos données restent dans votre répertoire local.
  </div>
</template>
