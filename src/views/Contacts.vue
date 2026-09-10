<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Plus, ContactIcon } from 'lucide-vue-next';
import { askConfirmation } from '../composables/confirmation';
import { state, run, refresh } from '../composables/app';
import { api } from '../services/api';
import { contactSchema, newBase, type Contact } from '../domain/models';
import Modal from '../components/Modal.vue';
import IconButton from '../components/IconButton.vue';
const route = useRoute();
const query = ref(String(route.query.q || ''));
watch(
  () => route.query.q,
  (q) => (query.value = String(q || '')),
);
const draft = ref<Contact | null>(null),
  isNew = ref(false),
  error = ref('');
const contacts = computed(() =>
  [...state.contacts]
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .filter((c) =>
      `${c.nom} ${c.structure} ${c.fonction} ${c.telephone} ${c.email}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
    ),
);
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('');
}
function add() {
  isNew.value = true;
  error.value = '';
  draft.value = {
    ...newBase(),
    nom: '',
    structure: '',
    fonction: '',
    telephone: '',
    email: '',
    adresse: '',
    notes: '',
  };
}
function edit(contact: Contact) {
  isNew.value = false;
  error.value = '';
  draft.value = { ...contact };
}
async function save() {
  if (!draft.value) return;
  const result = contactSchema.safeParse(draft.value);
  if (!result.success) {
    error.value = result.error.issues.map((issue) => issue.message).join(' ');
    return;
  }
  await run(async () => {
    await api(
      '/contacts' + (isNew.value ? '' : '/' + result.data.id),
      isNew.value ? 'POST' : 'PUT',
      result.data,
    );
    draft.value = null;
    await refresh();
  }, 'Contact enregistré');
}
async function remove(contact: Contact) {
  if (!(await askConfirmation(`Déplacer « ${contact.nom} » dans la corbeille ?`))) return;
  await run(async () => {
    await api('/contacts/' + contact.id, 'DELETE', { confirm: true });
    draft.value = null;
    await refresh();
  }, 'Contact déplacé dans la corbeille');
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">EN DEHORS DE L’ASSOCIATION</span>
      <h1>
        Contacts <span class="count">{{ state.contacts.length }}</span>
      </h1>
      <p class="muted">
        CAF, PMI, mairie, assurance, fournisseurs… tout ce qui n’est pas un membre.
      </p>
    </div>
    <button class="primary" :disabled="state.busy" @click="add">
      <Plus :size="16" />Nouveau contact
    </button>
  </div>
  <div class="filters">
    <input
      v-model="query"
      aria-label="Rechercher dans les contacts"
      placeholder="Nom, structure, téléphone, e-mail…"
    />
  </div>
  <template v-if="contacts.length"
    ><article v-for="c in contacts" :key="c.id" class="list-card member-card">
      <div class="avatar">{{ initials(c.nom) }}</div>
      <div class="grow">
        <strong>{{ c.nom }}</strong>
        <small>{{
          [c.structure, c.fonction].filter(Boolean).join(' · ') || 'Sans structure'
        }}</small>
        <small>{{
          [c.telephone, c.email].filter(Boolean).join(' · ') || 'Aucune coordonnée'
        }}</small>
      </div>
      <IconButton label="Modifier le contact" @click="edit(c)" /><IconButton
        label="Supprimer le contact"
        icon="delete"
        @click="remove(c)"
      />
    </article>
  </template>
  <div v-else class="panel empty">
    <ContactIcon :size="28" />
    <p>
      {{
        state.contacts.length
          ? 'Aucun contact ne correspond à la recherche.'
          : 'Ajoutez votre premier contact utile à l’association.'
      }}
    </p>
  </div>
  <Modal
    v-if="draft"
    :title="isNew ? 'Nouveau contact' : 'Modifier le contact'"
    @close="draft = null"
  >
    <form class="form-grid" @submit.prevent="save">
      <p v-if="error" role="alert" class="error full">{{ error }}</p>
      <label class="full">Nom<input v-model="draft.nom" required maxlength="240" /></label>
      <label>Structure<input v-model="draft.structure" placeholder="CAF, mairie…" /></label>
      <label>Fonction<input v-model="draft.fonction" placeholder="Référent PSU" /></label>
      <label>Téléphone<input v-model="draft.telephone" type="tel" /></label>
      <label>E-mail<input v-model="draft.email" type="email" /></label>
      <label class="full">Adresse<textarea v-model="draft.adresse" rows="2" /></label>
      <label class="full">Notes<textarea v-model="draft.notes" rows="3" /></label>
      <footer class="full">
        <button type="button" class="secondary" :disabled="state.busy" @click="draft = null">
          Annuler</button
        ><button class="primary" :disabled="state.busy">Enregistrer</button>
      </footer>
    </form>
  </Modal>
</template>
