// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import MeetingForm from '../src/components/MeetingForm.vue';
import AgendaEditor from '../src/components/AgendaEditor.vue';
import Participants from '../src/components/Participants.vue';
import Calendar from '../src/components/Calendar.vue';
import YearCalendar from '../src/components/YearCalendar.vue';
import Modal from '../src/components/Modal.vue';
import ActionList from '../src/components/ActionList.vue';
import SharePdf from '../src/components/SharePdf.vue';
import RichTextarea from '../src/components/RichTextarea.vue';
import { newBase, memberSchema, eventSchema, actionSchema } from '../src/domain/models';
import { state, toast } from '../src/composables/app';
enableAutoUnmount(afterEach);
afterEach(() => {
  vi.unstubAllGlobals();
  state.error = '';
  toast.value = '';
});
describe('Composants principaux', () => {
  it('crée une réunion depuis le formulaire et valide la date', async () => {
    const w = mount(MeetingForm);
    await w.get('input[type=date]').setValue('2026-09-15');
    await w.get('input[type=time]').setValue('19:00');
    await w.get('form').trigger('submit');
    expect(w.emitted('save')?.[0]?.[0]).toMatchObject({ date: '2026-09-15', heureDebut: '19:00' });
    await w.get('input[type=date]').setValue('');
    await w.get('form').trigger('submit');
    expect(w.get('[role=alert]').text()).toContain('Vérifiez');
  });
  it('ajoute et réordonne les points', async () => {
    const points = [
      {
        id: crypto.randomUUID(),
        titre: 'Budget',
        noteInterne: '',
        discussion: '',
        decision: '',
        vote: null,
        spontanee: false,
      },
      {
        id: crypto.randomUUID(),
        titre: 'Organisation',
        noteInterne: '',
        discussion: '',
        decision: '',
        vote: null,
        spontanee: false,
      },
    ];
    const w = mount(AgendaEditor, { props: { modelValue: points } });
    await w.findAll('[aria-label=Monter]')[1].trigger('click');
    expect(points[0].titre).toBe('Organisation');
    await w.get('.secondary').trigger('click');
    expect(points).toHaveLength(3);
  });
  it('gère les présences et procurations', async () => {
    const m = memberSchema.parse({
      ...newBase(),
      nom: 'Martin',
      prenom: 'Léa',
      fonction: 'Membre',
    });
    const rows: import('../src/domain/models').Participant[] = [];
    const w = mount(Participants, { props: { modelValue: rows, members: [m] } });
    await w.get('select').setValue(m.id);
    await w.setProps({ modelValue: [...rows] });
    expect(w.text()).toContain('Léa Martin');
    await w.findAll('select')[1].setValue('PROCURATION');
    expect(w.find('[aria-label=Mandataire]').exists()).toBe(true);
  });
  it('ajoute tous les membres actifs sans doublonner un enfant partagé par deux parents', async () => {
    const mother = memberSchema.parse({
      ...newBase(),
      nomComplet: 'Léa Martin',
      prenomEnfant: 'Léo',
      fonction: 'Membre',
    });
    const father = memberSchema.parse({
      ...newBase(),
      nomComplet: 'Paul Martin',
      prenomEnfant: 'Léo',
      fonction: 'Membre',
    });
    const other = memberSchema.parse({
      ...newBase(),
      nomComplet: 'Camille Bernard',
      fonction: 'Membre',
    });
    const rows: import('../src/domain/models').Participant[] = [];
    const w = mount(Participants, {
      props: { modelValue: rows, members: [mother, father, other] },
    });
    await w.get('.secondary').trigger('click');
    await w.setProps({ modelValue: [...rows] });
    expect(rows.map((p) => p.membreId)).toEqual([mother.id, other.id]);
  });
  it('place un événement dans le calendrier', () => {
    const e = eventSchema.parse({
      ...newBase(),
      titre: 'Échéance CAF',
      date: '2026-09-15',
      categorie: 'CAF',
    });
    const w = mount(Calendar, { props: { month: '2026-09', events: [e] } });
    expect(w.findAll('.day')).toHaveLength(42);
    expect(w.get('.calendar-event').text()).toBe('Échéance CAF');
  });
  it('colore les événements Vacances (mauve) et Action (bleu) dans le calendrier', () => {
    const vacances = eventSchema.parse({
      ...newBase(),
      titre: 'Vacances de printemps',
      date: '2026-09-15',
      categorie: 'Vacances',
    });
    const action = eventSchema.parse({
      ...newBase(),
      titre: 'Relancer la signature',
      date: '2026-09-16',
      categorie: 'Action',
    });
    const w = mount(Calendar, { props: { month: '2026-09', events: [vacances, action] } });
    const pills = w.findAll('.calendar-event');
    expect(pills[0].classes()).toContain('category-vacances');
    expect(pills[1].classes()).toContain('category-action');
  });
  it('colore aussi Vacances/Fermeture/Absences et Action dans la vue Année groupée par mois', () => {
    const vacances = eventSchema.parse({
      ...newBase(),
      titre: 'Vacances de printemps',
      date: '2026-09-15',
      categorie: 'Vacances',
    });
    const fermeture = eventSchema.parse({
      ...newBase(),
      titre: 'Fermeture exceptionnelle',
      date: '2026-09-16',
      categorie: 'Fermeture',
    });
    const absence = eventSchema.parse({
      ...newBase(),
      titre: 'Absence exceptionnelle',
      date: '2026-09-17',
      categorie: 'Absences',
    });
    const action = eventSchema.parse({
      ...newBase(),
      titre: 'Relancer la signature',
      date: '2026-09-18',
      categorie: 'Action',
    });
    const w = mount(YearCalendar, {
      props: { year: 2026, events: [vacances, fermeture, absence, action] },
    });
    const day = (n: number) => w.get(`[aria-label="2026-09-${String(n).padStart(2, '0')}"]`);
    expect(day(15).classes()).toContain('category-vacances');
    expect(day(16).classes()).toContain('category-vacances');
    expect(day(17).classes()).toContain('category-vacances');
    expect(day(18).classes()).toContain('category-action');
  });
  it('affiche un retard avec un texte explicite', () => {
    const a = actionSchema.parse({
      ...newBase(),
      titre: 'Mairie',
      dateCreation: '2020-01-01',
      echeance: '2020-01-02',
      statut: 'A_FAIRE',
    });
    const w = mount(ActionList, { props: { actions: [a] } });
    expect(w.get('.warning').text()).toBe('En retard');
  });
  it('ferme le dialogue avec Échap et expose son nom accessible', async () => {
    const w = mount(Modal, { props: { title: 'Modifier' }, attachTo: document.body });
    expect(document.querySelector('[role=dialog]')?.getAttribute('aria-label')).toBe('Modifier');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(w.emitted('close')).toHaveLength(1);
  });
  it('affiche un message clair si le PDF est indisponible lors du partage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const w = mount(SharePdf, {
      props: { href: '/api/reunions/1/pdf/pv', title: 'Procès-verbal', filename: 'PV.pdf' },
    });
    await w.get('button').trigger('click');
    await flushPromises();
    expect(state.error).toBe('Le PDF est indisponible. Générez-le à nouveau.');
  });
  it('sans API de partage native, télécharge le PDF et informe l’utilisateur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['%PDF-'], { type: 'application/pdf' }),
      }),
    );
    // jsdom does not implement the download-link navigation this triggers; only the
    // programmatic click itself is under test here.
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const w = mount(SharePdf, {
      props: { href: '/api/reunions/1/pdf/pv', title: 'Procès-verbal', filename: 'PV.pdf' },
    });
    await w.get('button').trigger('click');
    await flushPromises();
    expect(click).toHaveBeenCalledOnce();
    expect(state.error).toBe('');
    expect(toast.value).toContain('PDF téléchargé');
  });
  it('expose un libellé accessible qui ne se mélange pas aux boutons de la barre d’outils', () => {
    const w = mount(RichTextarea, {
      props: { modelValue: 'hello', label: 'Résumé des échanges' },
      attachTo: document.body,
    });
    expect(w.get('textarea').element.labels?.[0]?.textContent?.trim()).toBe('Résumé des échanges');
  });
  it('la barre d’outils entoure la sélection de marqueurs de mise en forme', async () => {
    const w = mount(RichTextarea, { props: { modelValue: 'hello world', label: 'Texte' } });
    const textarea = w.get('textarea').element as HTMLTextAreaElement;
    textarea.selectionStart = 0;
    textarea.selectionEnd = 5;
    await w.get('[aria-label=Gras]').trigger('click');
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['**hello** world']);
  });
  it('le soulignement utilise les balises <u></u> — la syntaxe que Markdown lui-même emploie', async () => {
    const w = mount(RichTextarea, { props: { modelValue: 'hello world', label: 'Texte' } });
    const textarea = w.get('textarea').element as HTMLTextAreaElement;
    textarea.selectionStart = 0;
    textarea.selectionEnd = 5;
    await w.get('[aria-label=Souligné]').trigger('click');
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['<u>hello</u> world']);
  });
  it('sans sélection, les marqueurs encadrent le curseur pour continuer à écrire dedans', async () => {
    const w = mount(RichTextarea, { props: { modelValue: '', label: 'Texte' } });
    const textarea = w.get('textarea').element as HTMLTextAreaElement;
    textarea.selectionStart = 0;
    textarea.selectionEnd = 0;
    await w.get('[aria-label=Italique]').trigger('click');
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['**']);
  });
  it('préfixe chaque ligne sélectionnée avec une puce ou une numérotation continue', async () => {
    const bullets = mount(RichTextarea, {
      props: { modelValue: 'Un\nDeux\nTrois', label: 'Texte' },
    });
    const bulletsArea = bullets.get('textarea').element as HTMLTextAreaElement;
    bulletsArea.selectionStart = 0;
    bulletsArea.selectionEnd = bulletsArea.value.length;
    await bullets.get('[aria-label="Liste à puces"]').trigger('click');
    expect(bullets.emitted('update:modelValue')?.[0]).toEqual(['- Un\n- Deux\n- Trois']);

    const numbered = mount(RichTextarea, {
      props: { modelValue: 'Un\nDeux\nTrois', label: 'Texte' },
    });
    const numberedArea = numbered.get('textarea').element as HTMLTextAreaElement;
    numberedArea.selectionStart = 0;
    numberedArea.selectionEnd = numberedArea.value.length;
    await numbered.get('[aria-label="Liste numérotée"]').trigger('click');
    expect(numbered.emitted('update:modelValue')?.[0]).toEqual(['1. Un\n2. Deux\n3. Trois']);
  });
  it('désactive tous les boutons de la barre d’outils quand le champ est désactivé', () => {
    const w = mount(RichTextarea, { props: { modelValue: '', label: 'Texte', disabled: true } });
    for (const button of w.findAll('.rich-toolbar button'))
      expect(button.attributes('disabled')).toBeDefined();
    expect(w.get('textarea').attributes('disabled')).toBeDefined();
  });
  it('applique une transformation (ex. glossaire) après une saisie normale', async () => {
    const w = mount(RichTextarea, {
      props: {
        modelValue: '',
        label: 'Texte',
        transform: (text: string, cursor: number) =>
          text.endsWith('@pmi ')
            ? { text: text.replace('@pmi ', 'Protection Maternelle et Infantile '), cursor }
            : null,
      },
    });
    const textarea = w.get('textarea').element as HTMLTextAreaElement;
    textarea.value = 'Voir @pmi ';
    await w.get('textarea').trigger('input');
    expect(w.emitted('update:modelValue')?.[0]).toEqual([
      'Voir Protection Maternelle et Infantile ',
    ]);
  });
});
