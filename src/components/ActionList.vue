<script setup lang="ts">
import { overdue, prettyDate, labels, type Action } from '../domain/models';
defineProps<{ actions: Action[] }>();
defineEmits<{ edit: [Action] }>();
</script>
<template>
  <div class="stack">
    <button v-for="a in actions" :key="a.id" class="list-card" @click="$emit('edit', a)">
      <span class="status-dot" /><span class="grow"
        ><strong>{{ a.titre }}</strong
        ><small>{{ a.responsable || 'Non attribuée' }} · {{ prettyDate(a.echeance) }}</small></span
      ><span class="badge" :class="{ warning: overdue(a) }">{{
        overdue(a) ? 'En retard' : labels[a.statut]
      }}</span>
    </button>
    <p v-if="!actions.length" class="empty">Aucune action dans cette liste.</p>
  </div>
</template>
