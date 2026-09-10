<script setup lang="ts">
import { askConfirmation } from '../composables/confirmation';
import type { Point } from '../domain/models';
import IconButton from './IconButton.vue';
const points = defineModel<Point[]>({ required: true });
defineProps<{ disabled?: boolean }>();
function add() {
  points.value.push({
    id: crypto.randomUUID(),
    titre: 'Nouveau point',
    noteInterne: '',
    discussion: '',
    decision: '',
    vote: null,
    spontanee: false,
  });
}
function move(i: number, d: number) {
  const p = points.value.splice(i, 1)[0];
  points.value.splice(i + d, 0, p);
}
function duplicate(i: number) {
  points.value.splice(i + 1, 0, {
    ...(JSON.parse(JSON.stringify(points.value[i])) as Point),
    id: crypto.randomUUID(),
  });
}
async function remove(i: number) {
  const id = points.value[i]?.id;
  if (await askConfirmation('Supprimer ce point et son contenu du PV ?')) {
    const index = points.value.findIndex((point) => point.id === id);
    if (index >= 0) points.value.splice(index, 1);
  }
}
</script>
<template>
  <div class="stack">
    <div v-if="!points.length" class="empty">Ajoutez les sujets à aborder pendant la réunion.</div>
    <article v-for="(p, i) in points" :key="p.id" class="agenda-point">
      <div class="row">
        <span class="number">{{ i + 1 }}</span
        ><input
          v-model="p.titre"
          :aria-label="`Point ${i + 1}`"
          :disabled="disabled"
          required
          maxlength="240"
        /><IconButton
          label="Monter"
          icon="up"
          :disabled="disabled || i === 0"
          @click="move(i, -1)"
        /><IconButton
          label="Descendre"
          icon="down"
          :disabled="disabled || i === points.length - 1"
          @click="move(i, 1)"
        /><IconButton
          label="Dupliquer"
          icon="copy"
          :disabled="disabled"
          @click="duplicate(i)"
        /><IconButton
          label="Supprimer le point"
          icon="delete"
          :disabled="disabled"
          @click="remove(i)"
        />
      </div>
      <details>
        <summary>Note interne</summary>
        <textarea
          v-model="p.noteInterne"
          aria-label="Note interne"
          :disabled="disabled"
          placeholder="Non incluse dans les PDF"
        />
      </details>
    </article>
    <button class="secondary fit" :disabled="disabled" @click="add">+ Ajouter un point</button>
  </div>
</template>
