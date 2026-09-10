<script setup lang="ts">
import { askConfirmation } from '../composables/confirmation';
import { ref, onMounted, onBeforeUnmount, computed, toRaw, watch } from 'vue';
import { useRoute, onBeforeRouteLeave } from 'vue-router';
import { ArrowLeft, Save, FileText, LockKeyhole } from 'lucide-vue-next';
import { api } from '../services/api';
import { state, run, refresh, notify } from '../composables/app';
import {
  labels,
  meetingDisplayTitle,
  meetingStatuses,
  meetingTypes,
  meetingSchema,
  newBase,
  actionSchema,
  today,
  prettyDate,
  type Meeting,
  type Point,
} from '../domain/models';
import AgendaEditor from '../components/AgendaEditor.vue';
import RichTextarea from '../components/RichTextarea.vue';
import Participants from '../components/Participants.vue';
import MeetingTypes from '../components/MeetingTypes.vue';
import MeetingLocation from '../components/MeetingLocation.vue';
import SharePdf from '../components/SharePdf.vue';
import { votingCapacity, voteErrors, meetingWriteSchema } from '../domain/participants';
import { expandGlossaryTag } from '../domain/glossaire';
const route = useRoute(),
  m = ref<Meeting>(),
  tab = ref('Résumé'),
  saved = ref('');
const locked = computed(() => !!m.value?.pvValideLe),
  dirty = computed(() => !!m.value && JSON.stringify(m.value) !== saved.value);
const storageKey = `filoustics:draft:${state.workspace}:${route.params.id}`;
const draftKey = () => storageKey;
function rememberDraft() {
  try {
    if (dirty.value && !locked.value) sessionStorage.setItem(draftKey(), JSON.stringify(m.value));
    else sessionStorage.removeItem(draftKey());
  } catch {
    state.error =
      'Le brouillon ne peut pas être conservé dans cet onglet. Enregistrez vos modifications avant de fermer.';
  }
}
async function load() {
  await run(async () => {
    m.value = await api<Meeting>('/reunions/' + route.params.id);
    saved.value = JSON.stringify(m.value);
    let draft: string | null = null;
    try {
      draft = sessionStorage.getItem(draftKey());
    } catch {
      /* Saving remains available if browser storage is disabled. */
    }
    if (draft && !locked.value) {
      let value: unknown;
      try {
        value = JSON.parse(draft);
      } catch {
        sessionStorage.removeItem(draftKey());
        return;
      }
      const candidate = meetingSchema.safeParse(value);
      if (
        candidate.success &&
        candidate.data.updatedAt === m.value.updatedAt &&
        candidate.data.id === m.value.id &&
        (await askConfirmation(
          'Un brouillon non enregistré a été retrouvé dans cet onglet. Reprendre les modifications ?',
        ))
      )
        m.value = candidate.data;
      else sessionStorage.removeItem(draftKey());
    }
  });
}
async function save() {
  if (!m.value || locked.value) return false;
  let ok = false;
  await run(async () => {
    meetingWriteSchema.parse(m.value);
    m.value = await api<Meeting>('/reunions/' + m.value!.id, 'PUT', m.value);
    saved.value = JSON.stringify(m.value);
    await refresh();
    ok = true;
  }, 'Enregistré');
  return ok;
}
async function pdf(kind: string) {
  if (!m.value) return;
  if (dirty.value && !(await save())) return;
  if (
    m.value.generations[kind] &&
    !(await askConfirmation('Régénérer et remplacer ce PDF ? L’ancienne version sera sauvegardée.'))
  )
    return;
  await run(async () => {
    const result = await api<{ meeting: Meeting }>('/reunions/' + m.value!.id + '/' + kind, 'POST');
    m.value = result.meeting;
    saved.value = JSON.stringify(m.value);
    await refresh();
  }, 'PDF généré');
}
async function validate() {
  if (dirty.value && !(await save())) return;
  await run(async () => {
    m.value = await api<Meeting>('/reunions/' + m.value!.id + '/valider', 'POST');
    saved.value = JSON.stringify(m.value);
    await refresh();
  }, 'PV validé et protégé');
}
async function reopen() {
  if (!(await askConfirmation('Rouvrir ce PV validé pour permettre les modifications ?'))) return;
  await run(async () => {
    m.value = await api<Meeting>('/reunions/' + m.value!.id + '/rouvrir', 'POST', {
      confirm: true,
    });
    saved.value = JSON.stringify(m.value);
    await refresh();
  }, 'PV rouvert');
}
async function createAction(point: Point) {
  if (!m.value) return;
  if (dirty.value && !(await save())) return;
  await run(async () => {
    const value = actionSchema.parse({
      ...newBase(),
      titre: point.decision.slice(0, 240) || point.titre,
      description: point.decision,
      dateCreation: today(),
      statut: 'A_FAIRE',
      reunionSource: m.value!.id,
      decisionSource: point.id,
    });
    await api('/actions', 'POST', value);
    await refresh();
  }, 'Action créée · responsable et échéance à compléter dans Actions');
}
function addSpontaneousPoint() {
  if (!m.value || locked.value) return;
  m.value.ordreDuJour.push({
    id: crypto.randomUUID(),
    titre: 'Point ajouté pendant la séance',
    noteInterne: '',
    discussion: '',
    decision: '',
    vote: null,
    spontanee: true,
  });
}
watch(m, rememberDraft, { deep: true });
watch(saved, rememberDraft);
function onSave() {
  void save();
}
onMounted(() => {
  void load();
  document.addEventListener('app-save', onSave);
});
onBeforeUnmount(() => {
  document.removeEventListener('app-save', onSave);
});
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  const leave = await askConfirmation('Quitter sans enregistrer les modifications ?');
  if (leave) sessionStorage.removeItem(draftKey());
  return leave;
});
const related = computed(() => state.actions.filter((a) => a.reunionSource === m.value?.id));
const capacity = computed(() => votingCapacity(m.value?.participants || []));
const invalidVotes = computed(() => (m.value ? voteErrors(m.value) : []));
function voteMax(point: Point, field: 'pour' | 'contre' | 'abstention') {
  if (!point.vote) return capacity.value;
  return Math.max(
    0,
    capacity.value -
      Object.entries(point.vote)
        .filter(([key]) => key !== field)
        .reduce((sum, [, value]) => sum + value, 0),
  );
}
function setVote(point: Point, field: 'pour' | 'contre' | 'abstention', event: Event) {
  if (!point.vote) return;
  const input = event.target as HTMLInputElement;
  const value = Number(input.value);
  point.vote[field] = Math.min(
    voteMax(point, field),
    Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0),
  );
  input.value = String(point.vote[field]);
}
// Typing "@clé" followed by a space or punctuation expands it to the glossary value
// live, right there in the PV text — no separate lookup needed while drafting.
function glossaryTransform(text: string, cursor: number) {
  return expandGlossaryTag(text, cursor, state.glossaire);
}
</script>
<template>
  <template v-if="m"
    ><div class="detail-heading">
      <RouterLink to="/reunions" class="back"><ArrowLeft :size="16" /> Réunions</RouterLink>
      <div class="row">
        <span v-if="dirty" class="unsaved">Non enregistré</span
        ><button
          v-if="!locked"
          class="primary"
          :disabled="state.busy || !!invalidVotes.length"
          @click="save"
        >
          <Save :size="15" />Enregistrer</button
        ><button v-else class="secondary" @click="reopen">
          <LockKeyhole :size="15" />Rouvrir le PV
        </button>
      </div>
    </div>
    <h1 class="meeting-title">{{ meetingDisplayTitle(m) }}</h1>
    <div class="row meeting-subtitle">
      <span class="badge">{{ labels[m.statut] }}</span
      ><span>{{ prettyDate(m.date) }} · {{ m.heureDebut }} · {{ m.lieu }}</span>
    </div>
    <div class="tabs">
      <button
        v-for="t in ['Résumé', 'Ordre du jour', 'Convocation', 'PV', 'Documents']"
        :key="t"
        :class="{ selected: tab === t }"
        @click="tab = t"
      >
        {{ t }}
      </button>
    </div>
    <div v-if="locked" class="locked-notice">
      <LockKeyhole :size="14" />PV validé le
      {{ new Date(m.pvValideLe!).toLocaleDateString('fr-FR') }} · modifications protégées
    </div>
    <div v-if="tab === 'Résumé'" class="panel">
      <fieldset :disabled="locked" class="form-grid">
        <label class="full">Titre (facultatif)<input v-model="m.titre" maxlength="240" /></label
        ><MeetingTypes
          v-model:primary="m.type"
          v-model:secondary="m.typeSecondaire"
          :disabled="locked"
        /><label
          >Statut<select v-model="m.statut">
            <option v-for="s in meetingStatuses" :key="s" :value="s">{{ labels[s] }}</option>
          </select></label
        ><label>Date<input v-model="m.date" type="date" /></label
        ><label>Heure de début<input v-model="m.heureDebut" type="time" /></label
        ><MeetingLocation v-model="m.lieu" :disabled="locked" /><label class="full"
          >Notes internes<textarea v-model="m.notes" rows="2" /></label
        ><label class="checkbox full"
          ><input v-model="m.archive" type="checkbox" />Archiver cette réunion</label
        >
      </fieldset>
    </div>
    <div v-if="tab === 'Ordre du jour'">
      <div class="document-toolbar">
        <span class="muted">{{ m.ordreDuJour.length }} points à aborder</span
        ><button class="secondary" :disabled="state.busy" @click="pdf('ordre-du-jour')">
          <FileText :size="15" />Générer PDF</button
        ><a
          v-if="m.generations['ordre-du-jour']"
          :href="`/api/reunions/${m.id}/pdf/ordre-du-jour`"
          target="_blank"
          rel="noopener"
          >Ouvrir PDF</a
        >
        <SharePdf
          v-if="m.generations['ordre-du-jour']"
          :href="`/api/reunions/${m.id}/pdf/ordre-du-jour`"
          title="Ordre du jour"
          :filename="`OrdreDuJour-${m.date}.pdf`"
        />
      </div>
      <AgendaEditor v-model="m.ordreDuJour" :disabled="locked" />
    </div>
    <section v-if="tab === 'Convocation'" class="panel stack">
      <h2>Préparer la convocation</h2>
      <p class="muted">La date, le lieu et l’ordre du jour sont repris automatiquement.</p>
      <Participants
        v-model="m.participants"
        :members="state.members"
        :disabled="locked"
        :attendance="false"
      />
      <div class="row">
        <button class="primary" :disabled="state.busy" @click="pdf('convocation')">
          <FileText :size="16" />{{
            m.generations.convocation ? 'Régénérer' : 'Générer PDF'
          }}</button
        ><a
          v-if="m.generations.convocation"
          :href="`/api/reunions/${m.id}/pdf/convocation`"
          target="_blank"
          rel="noopener"
          class="secondary"
          >Ouvrir PDF</a
        >
        <SharePdf
          v-if="m.generations.convocation"
          :href="`/api/reunions/${m.id}/pdf/convocation`"
          title="Convocation"
          :filename="`Convocation-${m.date}.pdf`"
        />
      </div>
      <small v-if="m.generations.convocation"
        >Générée le {{ new Date(m.generations.convocation).toLocaleString('fr-FR') }}</small
      ><label
        >Convocation envoyée le<input
          v-model="m.convocationEnvoyeeLe"
          type="date"
          :disabled="locked"
          @change="
            m.statut = m.convocationEnvoyeeLe ? 'CONVOCATION_ENVOYEE' : 'CONVOCATION_A_ENVOYER'
          "
      /></label>
    </section>
    <div v-if="tab === 'PV'" class="stack">
      <div class="document-toolbar">
        <a
          :href="`/api/reunions/${m.id}/preview/pv`"
          target="_blank"
          rel="noopener"
          class="secondary"
          >Prévisualiser le PV enregistré</a
        ><button
          class="secondary"
          :disabled="state.busy || !!invalidVotes.length"
          @click="pdf('pv')"
        >
          <FileText :size="15" />Générer PDF</button
        ><a
          v-if="m.generations.pv"
          :href="`/api/reunions/${m.id}/pdf/pv`"
          target="_blank"
          rel="noopener"
          class="secondary"
          >Ouvrir le PV PDF</a
        ><button
          v-if="!locked"
          class="primary"
          :disabled="state.busy || !!invalidVotes.length"
          @click="validate"
        >
          Valider le PV
        </button>
        <SharePdf
          v-if="m.generations.pv"
          :href="`/api/reunions/${m.id}/pdf/pv`"
          title="Procès-verbal"
          :filename="`PV-${m.date}.pdf`"
        />
      </div>
      <small v-if="!locked" class="muted"
        >La validation ajoute automatiquement le PDF du PV dans Documents.</small
      >
      <section class="panel stack">
        <h2>Présences & procurations</h2>
        <Participants
          v-model="m.participants"
          :members="state.members"
          :disabled="locked"
          attendance
        />
        <p class="muted">{{ capacity }} voix disponibles : membres présents et procurations.</p>
      </section>
      <p v-for="error in invalidVotes" :key="error.index" role="alert" class="vote-error">
        {{ error.message }}
      </p>
      <p v-if="!m.ordreDuJour.length" class="empty">
        Ajoutez les points préparés ou un point ajouté pendant la séance.
      </p>
      <button class="secondary fit" :disabled="locked" @click="addSpontaneousPoint">
        + Ajouter un point non prévu
      </button>
      <section v-for="(p, i) in m.ordreDuJour" :key="p.id" class="panel stack">
        <div class="row wrap">
          <h2>{{ i + 1 }}. {{ p.titre }}</h2>
          <span v-if="p.spontanee" class="badge">Ajouté en séance</span>
        </div>
        <label v-if="p.spontanee"
          >Intitulé du point ajouté<input v-model="p.titre" :disabled="locked" maxlength="240"
        /></label>
        <RichTextarea
          label="Résumé des échanges"
          v-model="p.discussion"
          :disabled="locked"
          :rows="3"
          :transform="glossaryTransform"
        />
        <RichTextarea
          label="Décision"
          v-model="p.decision"
          :disabled="locked"
          :rows="2"
          :transform="glossaryTransform"
        />
        <label class="checkbox"
          ><input
            type="checkbox"
            :checked="!!p.vote"
            :disabled="locked"
            @change="p.vote = p.vote ? null : { pour: 0, contre: 0, abstention: 0 }"
          />Consigner un vote</label
        >
        <div v-if="p.vote" class="vote-grid">
          <label
            >Pour<input
              :value="p.vote.pour"
              @input="setVote(p, 'pour', $event)"
              type="number"
              min="0"
              :max="voteMax(p, 'pour')"
              :disabled="locked" /></label
          ><label
            >Contre<input
              :value="p.vote.contre"
              @input="setVote(p, 'contre', $event)"
              type="number"
              min="0"
              :max="voteMax(p, 'contre')"
              :disabled="locked" /></label
          ><label
            >Abstention<input
              :value="p.vote.abstention"
              @input="setVote(p, 'abstention', $event)"
              type="number"
              min="0"
              :max="voteMax(p, 'abstention')"
              :disabled="locked"
          /></label>
        </div>
        <button
          class="secondary fit"
          :disabled="locked || state.busy || related.some((a) => a.decisionSource === p.id)"
          @click="createAction(p)"
        >
          + Créer une action liée
        </button>
      </section>
      <section class="panel stack">
        <label>Heure de clôture<input v-model="m.heureFin" type="time" :disabled="locked" /></label>
        <h2>Actions liées</h2>
        <RouterLink v-for="a in related" :key="a.id" to="/actions"
          >{{ a.titre }} · {{ a.responsable || 'À attribuer' }} ·
          {{ prettyDate(a.echeance) }}</RouterLink
        ><small v-if="!related.length">Aucune action liée.</small>
      </section>
    </div>
    <section v-if="tab === 'Documents'" class="panel stack">
      <h2>Documents liés</h2>
      <label v-for="d in state.documents" :key="d.id" class="checkbox"
        ><input v-model="m.documents" :value="d.id" type="checkbox" :disabled="locked" />{{ d.nom
        }}<a
          :href="`/api/documents/${d.id}/ouvrir`"
          target="_blank"
          rel="noopener"
          class="quiet-link"
          >Ouvrir</a
        ></label
      >
      <p v-if="!state.documents.length" class="empty">
        Importez vos fichiers dans Documents pour les lier à cette réunion.
      </p>
    </section></template
  >
</template>
