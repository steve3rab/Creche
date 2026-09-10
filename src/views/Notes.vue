<script setup lang="ts">
import { ref, computed, watch, toRaw } from 'vue';
import { useRoute, onBeforeRouteLeave } from 'vue-router';
import { Plus, NotebookPen } from 'lucide-vue-next';
import { state, run, refresh } from '../composables/app';
import { askConfirmation } from '../composables/confirmation';
import { api } from '../services/api';
import {
  noteSchema,
  newBase,
  noteImportance,
  noteImportanceLabels,
  type Note,
} from '../domain/models';
import { noteCategories, selectNotes, type NoteSort } from '../domain/notes';
import Modal from '../components/Modal.vue';
import IconButton from '../components/IconButton.vue';
const route = useRoute();
const query = ref(String(route.query.q || ''));
const category = ref(''),
  importance = ref(''),
  sort = ref<NoteSort>('recent');
const openedId = ref(String(route.query.id || ''));
const opened = computed(() => state.notes.find((note) => note.id === openedId.value));
const draft = ref<Note | null>(null),
  original = ref(''),
  isNew = ref(false),
  error = ref('');
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== original.value);
const categories = computed(() =>
  [...new Set([...noteCategories, ...state.notes.map((note) => note.categorie)])].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  ),
);
const visible = computed(() =>
  selectNotes(state.notes, query.value, category.value, importance.value, sort.value),
);
const date = (value: string) =>
  new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const linkedAction = (note: Note) =>
  note.actionId ? state.actions.find((a) => a.id === note.actionId) : undefined;
watch(
  () => route.query,
  (value) => {
    if (typeof value.id === 'string') openedId.value = value.id;
    if (typeof value.q === 'string') query.value = value.q;
  },
);
function edit(note?: Note) {
  isNew.value = !note;
  draft.value = note
    ? structuredClone(toRaw(note))
    : {
        ...newBase(),
        titre: '',
        contenu: '',
        categorie: category.value || 'Fonctionnement',
        importance: 'NORMAL',
        actionId: '',
      };
  original.value = JSON.stringify(draft.value);
  openedId.value = '';
  error.value = '';
}
async function closeEditor() {
  if (state.busy) return;
  if (
    dirty.value &&
    !(await askConfirmation('Fermer cette note sans enregistrer les modifications ?'))
  )
    return;
  draft.value = null;
}
async function save() {
  if (!draft.value || state.busy) return;
  const result = noteSchema.safeParse(draft.value);
  if (!result.success) {
    error.value = result.error.issues.map((issue) => issue.message).join(' ');
    return;
  }
  await run(async () => {
    const note = await api<Note>(
      '/notes' + (isNew.value ? '' : '/' + result.data.id),
      isNew.value ? 'POST' : 'PUT',
      result.data,
    );
    draft.value = null;
    await refresh();
    openedId.value = note.id;
  }, 'Note enregistrée');
}
async function remove(note: Note) {
  if (
    state.busy ||
    !(await askConfirmation(`Déplacer la note « ${note.titre} » dans la corbeille ?`))
  )
    return;
  await run(async () => {
    await api('/notes/' + note.id, 'DELETE', { confirm: true });
    openedId.value = '';
    await refresh();
  }, 'Note déplacée dans la corbeille');
}
function reset() {
  query.value = '';
  category.value = '';
  importance.value = '';
  sort.value = 'recent';
}
onBeforeRouteLeave(
  () => !dirty.value || askConfirmation('Quitter sans enregistrer les modifications de la note ?'),
);
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">REPÈRES ET MÉMOIRE DE L’ASSOCIATION</span>
      <h1>
        Notes <span class="count">{{ state.notes.length }}</span>
      </h1>
      <p class="muted">Vos informations utiles, classées et faciles à retrouver.</p>
    </div>
    <button class="primary" :disabled="state.busy" @click="edit()">
      <Plus :size="16" />Nouvelle note
    </button>
  </div>
  <div class="panel notes-filters">
    <label class="notes-search"
      >Rechercher<input v-model="query" type="search" placeholder="Titre, contenu ou catégorie…"
    /></label>
    <label
      >Catégorie<select v-model="category" aria-label="Catégorie">
        <option value="">Toutes les catégories</option>
        <option v-for="item in categories" :key="item">{{ item }}</option>
      </select></label
    >
    <label
      >Niveau d’importance<select v-model="importance" aria-label="Niveau d’importance">
        <option value="">Tous les niveaux</option>
        <option v-for="item in noteImportance" :key="item" :value="item">
          {{ noteImportanceLabels[item] }}
        </option>
      </select></label
    >
    <label
      >Trier par<select v-model="sort" aria-label="Trier par">
        <option value="recent">Modification : plus récente</option>
        <option value="ancien">Modification : plus ancienne</option>
        <option value="titre">Titre : A à Z</option>
        <option value="importance">Importance : décroissante</option>
        <option value="categorie">Catégorie : A à Z</option>
      </select></label
    >
  </div>
  <div class="section-heading notes-count">
    <span class="muted"
      >{{ visible.length }} note{{ visible.length > 1 ? 's' : '' }} affichée{{
        visible.length > 1 ? 's' : ''
      }}</span
    ><button
      v-if="query || category || importance || sort !== 'recent'"
      class="secondary"
      @click="reset"
    >
      Réinitialiser
    </button>
  </div>
  <div v-if="visible.length" class="notes-grid">
    <article v-for="note in visible" :key="note.id" class="panel note-card">
      <div class="row wrap">
        <span class="note-importance" :class="note.importance.toLowerCase()">{{
          noteImportanceLabels[note.importance]
        }}</span
        ><span class="muted note-category">{{ note.categorie }}</span>
      </div>
      <button class="note-title" @click="openedId = note.id">{{ note.titre }}</button>
      <p class="note-excerpt">{{ note.contenu }}</p>
      <RouterLink
        v-if="linkedAction(note)"
        :to="'/actions?q=' + encodeURIComponent(linkedAction(note)!.titre)"
        class="text-link"
        >Voir l’action liée</RouterLink
      >
      <footer>
        <small class="grow muted">Modifiée le {{ date(note.updatedAt) }}</small
        ><IconButton
          label="Modifier la note"
          :disabled="state.busy"
          @click="edit(note)"
        /><IconButton
          label="Supprimer la note"
          icon="delete"
          :disabled="state.busy"
          @click="remove(note)"
        />
      </footer>
    </article>
  </div>
  <div v-else class="panel empty">
    <NotebookPen :size="28" />
    <p>
      {{
        state.notes.length
          ? 'Aucune note ne correspond aux filtres.'
          : 'Ajoutez votre première note pour conserver vos informations utiles.'
      }}
    </p>
  </div>
  <Modal v-if="opened && !draft" :title="opened.titre" @close="openedId = ''">
    <div class="stack">
      <div class="row wrap">
        <span class="note-importance" :class="opened.importance.toLowerCase()">{{
          noteImportanceLabels[opened.importance]
        }}</span
        ><span class="muted">{{ opened.categorie }}</span>
      </div>
      <div class="note-content">{{ opened.contenu }}</div>
      <RouterLink
        v-if="linkedAction(opened)"
        :to="'/actions?q=' + encodeURIComponent(linkedAction(opened)!.titre)"
        class="text-link"
        >Voir l’action liée</RouterLink
      >
      <small class="muted">Modifiée le {{ date(opened.updatedAt) }}</small>
      <footer>
        <button class="secondary" @click="openedId = ''">Fermer</button
        ><button class="primary" :disabled="state.busy" @click="edit(opened)">Modifier</button>
      </footer>
    </div>
  </Modal>
  <Modal v-if="draft" :title="isNew ? 'Nouvelle note' : 'Modifier la note'" @close="closeEditor">
    <form class="form-grid" @submit.prevent="save">
      <p v-if="error" role="alert" class="full">{{ error }}</p>
      <label class="full"
        >Titre<input v-model="draft.titre" required maxlength="240" :disabled="state.busy"
      /></label>
      <label
        >Catégorie<input
          v-model="draft.categorie"
          list="note-categories"
          required
          maxlength="80"
          :disabled="state.busy" /><datalist id="note-categories">
          <option v-for="item in categories" :key="item" :value="item" /></datalist
      ></label>
      <label
        >Niveau d’importance<select
          v-model="draft.importance"
          aria-label="Niveau d’importance"
          :disabled="state.busy"
        >
          <option v-for="item in noteImportance" :key="item" :value="item">
            {{ noteImportanceLabels[item] }}
          </option>
        </select></label
      >
      <label class="full"
        >Contenu<textarea
          v-model="draft.contenu"
          rows="11"
          required
          maxlength="30000"
          :disabled="state.busy"
        />
      </label>
      <small class="full muted"
        >Choisissez une catégorie existante ou saisissez-en une nouvelle.</small
      >
      <footer class="full">
        <button type="button" class="secondary" :disabled="state.busy" @click="closeEditor">
          Annuler</button
        ><button class="primary" :disabled="state.busy">Enregistrer</button>
      </footer>
    </form>
  </Modal>
</template>
