<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Plus, BookOpen } from 'lucide-vue-next';
import { askConfirmation } from '../composables/confirmation';
import { state, run, refresh } from '../composables/app';
import { api } from '../services/api';
import { glossaryEntrySchema, newBase, type GlossaryEntry } from '../domain/models';
import { selectGlossary } from '../domain/glossaire';
import Modal from '../components/Modal.vue';
import IconButton from '../components/IconButton.vue';
const route = useRoute();
const query = ref(String(route.query.q || ''));
watch(
  () => route.query.q,
  (q) => (query.value = String(q || '')),
);
const draft = ref<GlossaryEntry | null>(null),
  isNew = ref(false),
  error = ref('');
const visible = computed(() => selectGlossary(state.glossaire, query.value));
function add() {
  isNew.value = true;
  error.value = '';
  draft.value = { ...newBase(), cle: '', valeur: '', description: '' };
}
function edit(entry: GlossaryEntry) {
  isNew.value = false;
  error.value = '';
  draft.value = { ...entry };
}
async function save() {
  if (!draft.value) return;
  const result = glossaryEntrySchema.safeParse(draft.value);
  if (!result.success) {
    error.value = result.error.issues.map((issue) => issue.message).join(' ');
    return;
  }
  await run(async () => {
    await api(
      '/glossaire' + (isNew.value ? '' : '/' + result.data.id),
      isNew.value ? 'POST' : 'PUT',
      result.data,
    );
    draft.value = null;
    await refresh();
  }, 'Entrée enregistrée');
}
async function remove(entry: GlossaryEntry) {
  if (!(await askConfirmation(`Déplacer « ${entry.cle} » dans la corbeille ?`))) return;
  await run(async () => {
    await api('/glossaire/' + entry.id, 'DELETE', { confirm: true });
    await refresh();
  }, 'Entrée déplacée dans la corbeille');
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">MOTS ET ABRÉVIATIONS DE L’ASSOCIATION</span>
      <h1>
        Glossaire <span class="count">{{ state.glossaire.length }}</span>
      </h1>
      <p class="muted">
        Écrivez « @clé » suivi d’un espace ou d’une ponctuation dans un PV pour l’insérer
        automatiquement.
      </p>
    </div>
    <button class="primary" :disabled="state.busy" @click="add">
      <Plus :size="16" />Nouvelle entrée
    </button>
  </div>
  <div class="filters">
    <input
      v-model="query"
      aria-label="Rechercher dans le glossaire"
      placeholder="Clé, valeur ou description…"
    />
  </div>
  <div v-if="visible.length" class="panel glossary-table-wrap">
    <table class="glossary-table">
      <thead>
        <tr>
          <th>Clé</th>
          <th>Valeur</th>
          <th>Description</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in visible" :key="entry.id">
          <td>
            <code>@{{ entry.cle }}</code>
          </td>
          <td>{{ entry.valeur }}</td>
          <td class="muted">{{ entry.description || '—' }}</td>
          <td class="glossary-actions">
            <IconButton
              label="Modifier l’entrée"
              :disabled="state.busy"
              @click="edit(entry)"
            /><IconButton
              label="Supprimer l’entrée"
              icon="delete"
              :disabled="state.busy"
              @click="remove(entry)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else class="panel empty">
    <BookOpen :size="28" />
    <p>
      {{
        state.glossaire.length
          ? 'Aucune entrée ne correspond à la recherche.'
          : 'Ajoutez votre première entrée de glossaire.'
      }}
    </p>
  </div>
  <Modal
    v-if="draft"
    :title="isNew ? 'Nouvelle entrée' : 'Modifier l’entrée'"
    @close="draft = null"
  >
    <form class="form-grid" @submit.prevent="save">
      <p v-if="error" role="alert" class="error full">{{ error }}</p>
      <label
        >Clé<input
          v-model="draft.cle"
          required
          maxlength="60"
          placeholder="crip"
          :disabled="state.busy"
      /></label>
      <label
        >Valeur<input
          v-model="draft.valeur"
          required
          maxlength="240"
          placeholder="Cellule de recueil des informations préoccupantes"
          :disabled="state.busy"
      /></label>
      <label class="full"
        >Description<textarea v-model="draft.description" rows="3" :disabled="state.busy" />
      </label>
      <small class="full muted"
        >La clé ne doit contenir ni espace ni @. Tapez « @clé » suivi d’un espace, d’une virgule ou
        d’un point pendant la rédaction d’un PV pour l’insérer.</small
      >
      <footer class="full">
        <button type="button" class="secondary" :disabled="state.busy" @click="draft = null">
          Annuler</button
        ><button class="primary" :disabled="state.busy">Enregistrer</button>
      </footer>
    </form>
  </Modal>
</template>
