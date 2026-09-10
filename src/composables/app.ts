import { reactive, ref, computed } from 'vue';
import { api } from '../services/api';
import { sortMeetings, dayDelta } from '../domain/models';
import type {
  Meeting,
  Member,
  Action,
  AgendaEvent,
  Document,
  Config,
  Note,
  GlossaryEntry,
  Shift,
  Contact,
} from '../domain/models';
export const state = reactive({
  meetings: [] as Meeting[],
  members: [] as Member[],
  actions: [] as Action[],
  events: [] as AgendaEvent[],
  documents: [] as Document[],
  notes: [] as Note[],
  glossaire: [] as GlossaryEntry[],
  planning: [] as Shift[],
  contacts: [] as Contact[],
  config: null as Config | null,
  workspace: '',
  configured: false,
  ready: false,
  error: '',
  busy: false,
});
// Meetings due within config.rappelJours days — the automatic reminder window shown
// on every screen, recomputed as soon as the date or the setting changes.
export const meetingReminders = computed(() => {
  const days = state.config?.rappelJours ?? 3;
  return sortMeetings(
    state.meetings.filter((m) => {
      if (m.archive || m.statut === 'CLOTUREE') return false;
      const delta = dayDelta(m.date);
      return delta >= 0 && delta <= days;
    }),
  );
});
export const toast = ref('');
let timer: ReturnType<typeof setTimeout>;
let pendingOperations = 0;
let refreshSequence = 0;
export function notify(message = 'Enregistré') {
  toast.value = message;
  clearTimeout(timer);
  timer = setTimeout(() => (toast.value = ''), 3500);
}
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<T | undefined> {
  state.error = '';
  pendingOperations++;
  state.busy = true;
  try {
    const result = await fn();
    if (message) notify(message);
    return result;
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
    return undefined;
  } finally {
    state.busy = --pendingOperations > 0;
  }
}
export async function refresh() {
  const sequence = ++refreshSequence;
  const results = await Promise.allSettled([
    api<Meeting[]>('/reunions'),
    api<Member[]>('/membres'),
    api<Action[]>('/actions'),
    api<AgendaEvent[]>('/agenda'),
    api<Document[]>('/documents'),
    api<Config>('/config'),
    api<Note[]>('/notes'),
    api<GlossaryEntry[]>('/glossaire'),
    api<Shift[]>('/planning'),
    api<Contact[]>('/contacts'),
  ]);
  if (sequence !== refreshSequence) return;
  const [m, mb, a, e, d, c, n, g, p, ct] = results;
  if (m.status === 'fulfilled') state.meetings = m.value;
  if (mb.status === 'fulfilled') state.members = mb.value;
  if (a.status === 'fulfilled') state.actions = a.value;
  if (e.status === 'fulfilled') state.events = e.value;
  if (d.status === 'fulfilled') state.documents = d.value;
  if (c.status === 'fulfilled') state.config = c.value;
  if (n.status === 'fulfilled') state.notes = n.value;
  if (g.status === 'fulfilled') state.glossaire = g.value;
  if (p.status === 'fulfilled') state.planning = p.value;
  if (ct.status === 'fulfilled') state.contacts = ct.value;
  const failed = results.find((r) => r.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}
export async function boot() {
  await run(async () => {
    const s = await api<{ configured: boolean; workspace: string }>('/setup');
    if (s.workspace !== state.workspace) {
      refreshSequence++;
      state.meetings = [];
      state.members = [];
      state.actions = [];
      state.events = [];
      state.documents = [];
      state.notes = [];
      state.glossaire = [];
      state.planning = [];
      state.contacts = [];
      state.config = null;
    }
    state.configured = s.configured;
    state.workspace = s.workspace;
    if (s.configured) await refresh();
  });
  state.ready = true;
}
