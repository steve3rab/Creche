<script setup lang="ts">
import { askConfirmation } from '../composables/confirmation';
import { ref, onMounted, computed } from 'vue';
import { cleanSignature, defaultSignatureHtml } from '../domain/branding';
import { HardDrive, FolderOpen, ShieldCheck, RotateCcw, Download } from 'lucide-vue-next';
import { state, run, refresh, boot } from '../composables/app';
import { api } from '../services/api';
import { configSchema, type Config } from '../domain/models';
const config = ref<Config>(),
  backups = ref<{ id: string }[]>([]),
  directory = ref(state.workspace),
  association = ref(state.config?.association || 'Les Filoustics');
const logoLoading = ref(false);
const signaturePreview = computed(() => cleanSignature(config.value?.signatureHtml || ''));
async function chooseLogo(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !config.value || logoLoading.value) return;
  logoLoading.value = true;
  try {
    await run(async () => {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw new Error('Choisissez une image PNG, JPEG ou WebP de moins de 10 Mo.');
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Impossible de préparer cette image.');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const value = canvas.toDataURL('image/png');
        config.value = configSchema.parse({ ...config.value, logoDataUrl: value });
      } finally {
        bitmap.close();
      }
    });
  } finally {
    logoLoading.value = false;
  }
}
async function load() {
  config.value = state.config ? { ...state.config } : undefined;
  await run(async () => {
    backups.value = await api<{ id: string }[]>('/sauvegardes');
  });
}
onMounted(load);
async function save() {
  await run(async () => {
    config.value = await api<Config>('/config', 'PUT', configSchema.parse(config.value));
    await refresh();
  }, 'Paramètres enregistrés');
}
async function backup() {
  await run(async () => {
    await api('/sauvegardes', 'POST');
    backups.value = await api('/sauvegardes');
  }, 'Sauvegarde créée');
}
function exportUrl(id: string) {
  return '/api/sauvegardes/' + id + '/export';
}
async function exportOffSite() {
  await run(async () => {
    const created = await api<{ id: string }>('/sauvegardes', 'POST');
    backups.value = await api('/sauvegardes');
    window.location.href = exportUrl(created.id);
  }, 'Sauvegarde hors-site créée : enregistrez le fichier .zip sur une clé USB ou un espace personnel.');
}
async function restore(id: string) {
  if (
    !(await askConfirmation(
      'Restaurer cette sauvegarde et remplacer les données actuelles ? Une copie de sécurité sera conservée.',
    ))
  )
    return;
  await run(async () => {
    await api('/sauvegardes/' + id + '/restaurer', 'POST', { confirm: true });
    await refresh();
    await load();
  }, 'Sauvegarde restaurée');
}
async function openDirectory() {
  await run(() => api('/ouvrir-repertoire', 'POST'), 'Répertoire ouvert dans l’Explorateur');
}
async function changeWorkspace() {
  await run(async () => {
    await api('/setup', 'POST', { workspace: directory.value, association: association.value });
    await boot();
    await load();
  }, 'Répertoire ouvert');
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">VOTRE ESPACE, VOS DONNÉES</span>
      <h1>Paramètres</h1>
      <p class="muted">Tout reste sur cet ordinateur.</p>
    </div>
    <HardDrive :size="27" class="muted" />
  </div>
  <div class="stack">
    <form v-if="config" class="panel form-grid" @submit.prevent="save">
      <h2 class="full">L’association</h2>
      <label class="full">Nom de l’association<input v-model="config.association" required /></label
      ><label class="full">Adresse<textarea v-model="config.adresse" rows="2" /></label
      ><label
        >Sauvegardes à conserver<input
          v-model.number="config.retention"
          type="number"
          min="2"
          max="100"
          required /></label
      ><label
        >Rappel avant une réunion (jours)<input
          v-model.number="config.rappelJours"
          type="number"
          min="0"
          max="30"
          required
      /></label>
      <small class="full muted"
        >Un rappel apparaît en haut de l’écran dès qu’une réunion approche dans ce délai.</small
      >
      <h2 class="full">Présentation des PDF</h2>
      <div class="full stack">
        <label
          >Logo de l’association<input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            :disabled="logoLoading || state.busy"
            @change="chooseLogo"
        /></label>
        <small
          >Une seule image, remplacée à chaque sélection. Sans logo, le nom de l’association
          apparaît en haut du PDF.</small
        >
        <div v-if="config.logoDataUrl" class="row wrap">
          <img class="logo-preview" :src="config.logoDataUrl" alt="Logo de l’association" />
          <button type="button" class="secondary" @click="config.logoDataUrl = ''">
            Retirer le logo
          </button>
        </div>
        <label
          >Signature HTML<textarea
            v-model="config.signatureHtml"
            rows="5"
            maxlength="4000"
            spellcheck="false"
          />
        </label>
        <small>Cette signature est imprimée dans le pied de page de chaque PDF.</small>
        <button
          type="button"
          class="secondary fit"
          @click="config.signatureHtml = defaultSignatureHtml"
        >
          Remettre la signature par défaut
        </button>
        <!-- signaturePreview is cleanSignature(...)-sanitized above, not raw input. -->
        <!-- eslint-disable vue/no-v-html -->
        <div
          class="signature-preview"
          aria-label="Aperçu de la signature"
          v-html="signaturePreview"
        />
        <!-- eslint-enable vue/no-v-html -->
        <small>Les changements s’appliquent aux prochains PDF générés.</small>
      </div>
      <footer class="full">
        <button class="primary" :disabled="state.busy || logoLoading">Enregistrer</button>
      </footer>
    </form>
    <section class="panel stack">
      <h2>Répertoire de travail</h2>
      <code class="path">{{ state.workspace }}</code>
      <div class="row wrap">
        <button class="secondary" @click="openDirectory">
          <FolderOpen :size="15" />Ouvrir le répertoire</button
        ><button
          class="secondary"
          @click="run(() => api('/verifier', 'POST'), 'Données vérifiées')"
        >
          <ShieldCheck :size="15" />Vérifier les données</button
        ><a href="/api/logs" target="_blank" rel="noopener" class="quiet-link">Ouvrir les logs</a>
      </div>
      <details>
        <summary>Changer de répertoire</summary>
        <form class="stack" @submit.prevent="changeWorkspace">
          <label>Chemin local<input v-model="directory" required /></label
          ><label
            >Nom de l’association (nouveau dossier)<input v-model="association" required
          /></label>
          <p class="muted">Le dossier actuel est conservé. Les données ne sont pas déplacées.</p>
          <button class="secondary fit">Ouvrir ce répertoire</button>
        </form>
      </details>
    </section>
    <section id="sauvegardes" class="panel stack">
      <div class="section-heading">
        <h2>Sauvegardes</h2>
        <button class="primary" :disabled="state.busy" @click="backup">Créer une sauvegarde</button>
      </div>
      <p class="muted">
        Copie complète avant chaque modification. Les {{ config?.retention || 20 }} dernières sont
        conservées.
      </p>
      <div class="backup-list">
        <div v-for="b in backups" :key="b.id" class="row backup-row">
          <code class="grow">{{ b.id.slice(0, 19).replace('T', ' à ') }}</code
          ><a class="secondary" :href="exportUrl(b.id)" :download="'Filoustics_' + b.id + '.zip'"
            ><Download :size="14" />.zip</a
          ><button class="secondary" :disabled="state.busy" @click="restore(b.id)">
            <RotateCcw :size="14" />Restaurer
          </button>
        </div>
        <p v-if="!backups.length" class="empty">Aucune sauvegarde disponible.</p>
      </div>
      <div class="stack offsite-export">
        <p class="muted">
          Une sauvegarde reste sur ce disque : en cas de panne ou de vol de l’ordinateur, elle est
          perdue avec le reste. Téléchargez régulièrement une copie <strong>hors-site</strong>
          (.zip) sur une clé USB ou un espace personnel, en dehors de cet ordinateur.
        </p>
        <button class="secondary fit" :disabled="state.busy" @click="exportOffSite">
          <Download :size="15" />Créer et télécharger une sauvegarde hors-site (.zip)
        </button>
      </div>
    </section>
  </div>
</template>
