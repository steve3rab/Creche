<script setup lang="ts">
import { Share2 } from 'lucide-vue-next';
import { notify, run, state } from '../composables/app';
const props = defineProps<{ href: string; title: string; filename: string }>();
type ShareNavigator = Navigator & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};
async function share() {
  // A cancelled native share sheet is a normal outcome, not a failure to report.
  await run(async () => {
    const response = await fetch(props.href);
    if (!response.ok) throw new Error('Le PDF est indisponible. Générez-le à nouveau.');
    const file = new File([await response.blob()], props.filename, { type: 'application/pdf' });
    const data: ShareData = { title: props.title, text: props.title, files: [file] };
    const browser = navigator as ShareNavigator;
    if (browser.share && (!browser.canShare || browser.canShare(data))) {
      try {
        await browser.share(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        throw error;
      }
      return;
    }
    const link = document.createElement('a');
    link.href = props.href;
    link.download = props.filename;
    link.click();
    notify('PDF téléchargé : joignez-le dans le réseau social ou la messagerie de votre choix.');
  });
}
</script>
<template>
  <button
    class="secondary"
    type="button"
    title="Choisir une application ou un réseau social"
    :disabled="state.busy"
    @click="share"
  >
    <Share2 :size="15" />Partager le PDF
  </button>
</template>
