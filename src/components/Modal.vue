<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import IconButton from './IconButton.vue';
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement>();
let previous: HTMLElement | null;
function key(e: KeyboardEvent) {
  if ([...document.querySelectorAll('.modal')].at(-1) !== panel.value) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  }
  if (e.key === 'Tab' && panel.value) {
    const els = [
      ...panel.value.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
      ),
    ];
    const first = els[0],
      last = els.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
}
onMounted(() => {
  previous = document.activeElement as HTMLElement;
  panel.value?.querySelector<HTMLElement>('input,button')?.focus();
  document.addEventListener('keydown', key);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', key);
  if (previous?.isConnected) previous.focus();
});
</script>
<template>
  <Teleport to="body"
    ><div class="modal-backdrop">
      <section ref="panel" class="modal" role="dialog" aria-modal="true" :aria-label="title">
        <header>
          <h2>{{ title }}</h2>
          <IconButton label="Fermer" icon="close" @click="emit('close')" />
        </header>
        <slot />
      </section></div
  ></Teleport>
</template>
