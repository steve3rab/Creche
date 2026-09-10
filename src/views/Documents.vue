<script setup lang="ts">
import { askConfirmation } from '../composables/confirmation';
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { Upload, FileText, RotateCcw, Trash2 } from 'lucide-vue-next';
import { state, run, refresh } from '../composables/app';
import { api } from '../services/api';
import {
  categories,
  labels,
  newBase,
  documentSchema,
  prettyDate,
  type Document,
} from '../domain/models';
import Modal from '../components/Modal.vue';
import IconButton from '../components/IconButton.vue';
const route = useRoute(),
  query = ref(String(route.query.q || '')),
  category = ref(''),
  archive = ref(false),
  trashOpen = ref(false),
  trash = ref<{ id: string; label: string; date: string }[]>([]),
  draft = ref<Document | null>(null),
  file = ref<File>(),
  isNew = ref(false);
const rows = computed(() =>
  state.documents.filter(
    (d) =>
      d.archive === archive.value &&
      (!category.value || d.categorie === category.value) &&
      `${d.nom} ${d.description}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
);
function add() {
  isNew.value = true;
  file.value = undefined;
  draft.value = documentSchema.parse({
    ...newBase(),
    nom: 'Nouveau.pdf',
    categorie: 'divers',
    fichier: '',
    taille: 0,
  });
}
function edit(d: Document) {
  isNew.value = false;
  draft.value = JSON.parse(JSON.stringify(d)) as Document;
}
function choose(e: Event) {
  file.value = (e.target as HTMLInputElement).files?.[0];
  if (file.value && draft.value) draft.value.nom = file.value.name;
}
async function save() {
  if (!draft.value) return;
  await run(async () => {
    const document = documentSchema.parse(draft.value);
    if (isNew.value) {
      if (!file.value) throw new Error('Choisissez un fichier.');
      if (file.value.size > 20 * 1024 * 1024) throw new Error('Fichier limité à 20 Mo');
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
        reader.readAsDataURL(file.value!);
      });
      await api('/documents', 'POST', { document, content });
    } else await api('/documents/' + document.id, 'PUT', document);
    draft.value = null;
    await refresh();
  }, 'Document enregistré');
}
async function remove(d: Document) {
  if (await askConfirmation('Déplacer ce document dans la corbeille ?'))
    await run(async () => {
      await api('/documents/' + d.id, 'DELETE', { confirm: true });
      await refresh();
    }, 'Document déplacé dans la corbeille');
}
async function toggleArchive(d: Document) {
  await run(
    async () => {
      await api('/documents/' + d.id, 'PUT', { ...d, archive: !d.archive });
      await refresh();
    },
    d.archive ? 'Document désarchivé' : 'Document archivé',
  );
}
async function loadTrash() {
  trash.value = (await api<{ id: string; label: string; date: string }[]>('/corbeille')) || [];
}
async function openTrash() {
  trashOpen.value = true;
  await run(loadTrash);
}
async function recover(id: string) {
  if (!(await askConfirmation('Restaurer cet élément depuis la corbeille ?'))) return;
  await run(async () => {
    await api('/corbeille/' + id + '/restaurer', 'POST', { confirm: true });
    await Promise.all([refresh(), loadTrash()]);
  }, 'Élément restauré');
}
async function empty() {
  if (
    !(await askConfirmation(
      'Vider toute la corbeille ? Une sauvegarde sera créée avant le vidage.',
    ))
  )
    return;
  await run(async () => {
    await api('/corbeille', 'DELETE', { confirm: true });
    await loadTrash();
  }, 'Corbeille vidée');
}
onMounted(() => void run(loadTrash));
watch(
  () => route.query.q,
  (q) => (query.value = String(q || '')),
);
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">LA MÉMOIRE DE L’ASSOCIATION</span>
      <h1>Documents</h1>
      <p class="muted">Les bons documents, toujours à portée de main.</p>
    </div>
    <button class="primary" @click="add"><Upload :size="16" />Ajouter un fichier</button>
  </div>
  <div class="tabs">
    <button
      :class="{ selected: !archive && !trashOpen }"
      @click="((archive = false), (trashOpen = false))"
    >
      Documents
    </button>
    <button
      :class="{ selected: archive && !trashOpen }"
      @click="((archive = true), (trashOpen = false))"
    >
      Archives
    </button>
    <button :class="{ selected: trashOpen }" @click="openTrash">
      Corbeille <span class="count">{{ trash.length }}</span>
    </button>
  </div>
  <section v-if="trashOpen" id="corbeille" class="panel stack">
    <div class="section-heading">
      <div>
        <h2>
          Corbeille <span class="count">{{ trash.length }}</span>
        </h2>
        <p class="muted">Documents et autres éléments supprimés, récupérables avant le vidage.</p>
      </div>
      <button class="secondary danger" :disabled="!trash.length || state.busy" @click="empty">
        <Trash2 :size="15" />Vider la corbeille
      </button>
    </div>
    <div v-for="t in trash" :key="t.id" class="row backup-row">
      <div class="grow">
        <strong>{{ t.label }}</strong
        ><small>{{ new Date(t.date).toLocaleString('fr-FR') }}</small>
      </div>
      <button class="secondary" :disabled="state.busy" @click="recover(t.id)">
        <RotateCcw :size="14" />Restaurer
      </button>
    </div>
    <p v-if="!trash.length" class="empty">La corbeille est vide.</p>
  </section>
  <template v-else>
    <div class="filters">
      <input
        v-model="query"
        aria-label="Rechercher un document"
        placeholder="Nom ou description…"
      /><select v-model="category" aria-label="Catégorie de document">
        <option value="">Toutes les catégories</option>
        <option v-for="c in categories" :key="c" :value="c">{{ labels[c] }}</option>
      </select>
    </div>
    <div class="stack">
      <article v-for="d in rows" :key="d.id" class="list-card">
        <span class="file-icon"><FileText :size="23" /></span>
        <div class="grow">
          <a :href="`/api/documents/${d.id}/ouvrir`" target="_blank" rel="noopener"
            ><strong>{{ d.nom }}</strong></a
          ><small
            >{{ labels[d.categorie] }} · {{ prettyDate(d.createdAt.slice(0, 10)) }} ·
            {{ Math.max(1, Math.round(d.taille / 1024)) }} Ko</small
          ><small v-if="d.description">{{ d.description }}</small>
        </div>
        <IconButton label="Renommer ou déplacer" @click="edit(d)" /><IconButton
          :label="d.archive ? 'Désarchiver' : 'Archiver'"
          icon="archive"
          @click="toggleArchive(d)"
        /><IconButton label="Supprimer le document" icon="delete" @click="remove(d)" />
      </article>
      <section v-if="!rows.length" class="panel empty large">
        <FileText :size="32" />
        <h3>Une place pour chaque document.</h3>
        <p>Statuts, règlements, conventions et archives.</p>
        <button class="secondary" @click="add">Ajouter un fichier</button>
      </section>
    </div>
  </template>
  <Modal
    v-if="draft"
    :title="isNew ? 'Ajouter un document' : 'Modifier le document'"
    @close="draft = null"
    ><form class="stack" @submit.prevent="save">
      <label v-if="isNew"
        >Fichier (20 Mo maximum)<input
          type="file"
          accept=".pdf,.txt,.png,.jpg,.jpeg,.docx,.xlsx,.odt,.ods"
          required
          @change="choose" /></label
      ><label>Nom du fichier<input v-model="draft.nom" required maxlength="240" /></label
      ><label
        >Catégorie<select v-model="draft.categorie" aria-label="Catégorie">
          <option v-for="c in categories" :key="c" :value="c">{{ labels[c] }}</option>
        </select></label
      ><label>Description<textarea v-model="draft.description" rows="2" /></label>
      <footer><button class="primary" :disabled="state.busy">Enregistrer</button></footer>
    </form></Modal
  >
</template>
