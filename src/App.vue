<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Home,
  CalendarDays,
  FolderOpen,
  Users,
  CheckSquare,
  Settings,
  Search,
  Leaf,
  ShieldCheck,
  CalendarRange,
  Plus,
  NotebookPen,
  BookOpen,
  ClipboardList,
  ContactIcon,
  BarChart3,
  BellRing,
} from 'lucide-vue-next';
import { boot, state, toast, run, refresh, meetingReminders } from './composables/app';
import { api } from './services/api';
import Modal from './components/Modal.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import { confirmation } from './composables/confirmation';
import MeetingForm from './components/MeetingForm.vue';
import { meetingDisplayTitle, prettyDate, type Meeting } from './domain/models';
const router = useRouter(),
  route = useRoute(),
  creating = ref(false),
  searching = ref(false),
  query = ref(''),
  directory = ref('C:\\CrecheParentale'),
  association = ref('Les Filoustics'),
  remindersDismissed = ref(false);
const nav = [
  ['/', 'Accueil', Home],
  ['/reunions', 'Réunions', CalendarRange],
  ['/agenda', 'Agenda', CalendarDays],
  ['/planning', 'Planning', ClipboardList],
  ['/documents', 'Documents', FolderOpen],
  ['/membres', 'Membres', Users],
  ['/contacts', 'Contacts', ContactIcon],
  ['/actions', 'Actions', CheckSquare],
  ['/notes', 'Notes', NotebookPen],
  ['/glossaire', 'Glossaire', BookOpen],
  ['/statistiques', 'Statistiques', BarChart3],
] as const;
function isCurrentSpace(url: string) {
  return route.path === url || (url === '/reunions' && route.path.startsWith('/reunions/'));
}
const spaceTitle = computed(() => {
  if (route.path === '/parametres') return 'Paramètres';
  return nav.find(([url]) => isCurrentSpace(url))?.[1] || '';
});
async function create(m: Meeting) {
  await run(async () => {
    const result = await api<Meeting>('/reunions', 'POST', m);
    creating.value = false;
    await refresh();
    await router.push('/reunions/' + result.id);
  }, 'Réunion créée');
}
async function setup() {
  await run(async () => {
    await api('/setup', 'POST', { workspace: directory.value, association: association.value });
    await boot();
  });
}
function shortcut(e: KeyboardEvent) {
  if (confirmation.value) {
    if (e.ctrlKey && ['n', 'k', 's'].includes(e.key.toLowerCase())) e.preventDefault();
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    if (state.configured) creating.value = true;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searching.value = true;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    const form =
      document.querySelector<HTMLFormElement>('.modal form') ||
      document.querySelector<HTMLFormElement>('main form');
    if (form) form.requestSubmit();
    else document.dispatchEvent(new CustomEvent('app-save'));
  }
}
function newMeetingEvent() {
  if (!confirmation.value) creating.value = true;
}
onMounted(() => {
  void boot();
  window.addEventListener('keydown', shortcut);
  window.addEventListener('new-meeting', newMeetingEvent);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', shortcut);
  window.removeEventListener('new-meeting', newMeetingEvent);
});
const results = computed(() => {
  const q = query.value.toLocaleLowerCase('fr');
  if (!q) return [];
  return [
    ...state.meetings.map((x) => ({
      id: x.id,
      title: meetingDisplayTitle(x),
      kind: 'Réunion',
      url: '/reunions/' + x.id,
    })),
    ...state.documents.map((x) => ({
      id: x.id,
      title: x.nom,
      kind: 'Document',
      url: '/documents?q=' + encodeURIComponent(x.nom),
    })),
    ...state.members.map((x) => ({
      id: x.id,
      title: x.nomComplet,
      kind: 'Membre',
      url: '/membres?q=' + encodeURIComponent(x.nomComplet),
    })),
    ...state.actions.map((x) => ({
      id: x.id,
      title: x.titre,
      kind: 'Action',
      url: '/actions?q=' + encodeURIComponent(x.titre),
    })),
    ...state.events.map((x) => ({
      id: x.id,
      title: x.titre,
      kind: 'Agenda',
      url: '/agenda?q=' + encodeURIComponent(x.titre),
    })),
    ...state.notes.map((x) => ({
      id: x.id,
      title: x.titre,
      kind: 'Note',
      url: '/notes?id=' + x.id,
    })),
    ...state.glossaire.map((x) => ({
      id: x.id,
      title: x.cle,
      kind: 'Glossaire',
      url: '/glossaire?q=' + encodeURIComponent(x.cle),
    })),
    ...state.planning.map((x) => ({
      id: x.id,
      title: `${x.membre || 'Créneau'} · ${prettyDate(x.date)}`,
      kind: 'Planning',
      url: '/planning?date=' + x.date,
    })),
    ...state.contacts.map((x) => ({
      id: x.id,
      title: x.nom,
      kind: 'Contact',
      url: '/contacts?q=' + encodeURIComponent(x.nom),
    })),
  ]
    .filter((x) => x.title.toLocaleLowerCase('fr').includes(q))
    .slice(0, 30);
});
</script>
<template>
  <ConfirmationDialog />
  <div class="shell">
    <aside class="sidebar">
      <a class="brand" href="/" @click.prevent="router.push('/')"
        ><span class="brand-icon"><Leaf :size="22" /></span
        ><span>filoustics<small>LE SECRÉTARIAT</small></span></a
      >
      <nav>
        <RouterLink
          v-for="[url, title, icon] in nav"
          :key="url"
          :to="url"
          :class="{ active: isCurrentSpace(url) }"
          ><component :is="icon" :size="18" />{{ title }}</RouterLink
        >
      </nav>
      <div class="sidebar-bottom">
        <span class="local"><ShieldCheck :size="14" /> Sur votre ordinateur</span
        ><RouterLink to="/parametres" class="settings-link"
          ><Settings :size="18" />Paramètres</RouterLink
        >
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="workspace-title">
          <span class="association">{{ state.config?.association || 'Votre association' }}</span>
          <span v-if="spaceTitle" class="space-name">{{ spaceTitle }}</span>
        </div>
        <button class="search-trigger" @click="searching = true">
          <Search :size="15" /><span>Rechercher</span><kbd>Ctrl K</kbd>
        </button>
      </header>
      <div v-if="state.error" role="alert" class="error-banner">
        <span>{{ state.error }}</span
        ><RouterLink to="/parametres">Sauvegardes</RouterLink
        ><button aria-label="Fermer l’erreur" @click="state.error = ''">×</button>
      </div>
      <div
        v-if="!remindersDismissed && meetingReminders.length"
        role="note"
        class="error-banner reminder-banner"
      >
        <BellRing :size="15" />
        <span
          >{{
            meetingReminders.length === 1
              ? '1 réunion approche :'
              : meetingReminders.length + ' réunions approchent :'
          }}
          <RouterLink v-for="m in meetingReminders" :key="m.id" :to="'/reunions/' + m.id"
            >{{ meetingDisplayTitle(m) }} ({{ prettyDate(m.date) }})</RouterLink
          ></span
        ><button aria-label="Fermer le rappel" @click="remindersDismissed = true">×</button>
      </div>
      <main v-if="state.ready && state.configured"><RouterView :key="$route.path" /></main>
      <main v-else-if="state.ready" class="onboarding">
        <span class="eyebrow">BIENVENUE</span>
        <h1>Un peu d’ordre.<br />Plus de sérénité.</h1>
        <p class="muted">Votre secrétariat, conservé sur cet ordinateur.</p>
        <form class="panel stack" @submit.prevent="setup">
          <label>Nom de l’association<input v-model="association" required /></label
          ><label
            >Répertoire de travail<input
              v-model="directory"
              required
              placeholder="C:\CrecheParentale" /></label
          ><small
            >Choisissez un dossier local vide ou un dossier Filoustics existant, hors
            OneDrive.</small
          ><button class="primary" :disabled="state.busy">
            Ouvrir mon espace <Plus :size="16" />
          </button>
        </form>
      </main>
      <main v-else class="empty">Ouverture de votre espace…</main>
    </div>
  </div>
  <div v-if="toast" class="toast" role="status"><ShieldCheck :size="17" />{{ toast }}</div>
  <Modal v-if="creating" title="Nouvelle réunion" @close="creating = false"
    ><MeetingForm @save="create" /></Modal
  ><Modal v-if="searching" title="Rechercher dans votre espace" @close="searching = false"
    ><input
      v-model="query"
      autofocus
      placeholder="Réunion, document, membre…"
      aria-label="Recherche globale"
    />
    <div class="search-results">
      <RouterLink v-for="r in results" :key="r.id" :to="r.url" @click="searching = false"
        ><strong>{{ r.title }}</strong
        ><small>{{ r.kind }}</small></RouterLink
      >
      <p v-if="query && !results.length" class="empty">Aucun résultat.</p>
    </div></Modal
  >
</template>
