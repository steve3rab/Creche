<script setup lang="ts">
import { watch } from 'vue';
import { meetingTypes, labels, type Meeting } from '../domain/models';
const primary = defineModel<Meeting['type']>('primary', { required: true });
const secondary = defineModel<Meeting['typeSecondaire']>('secondary', { required: true });
defineProps<{ disabled?: boolean }>();
watch(primary, (v) => {
  if (secondary.value === v) secondary.value = '';
});
</script>
<template>
  <div class="form-grid full meeting-types">
    <label
      >Type principal<select v-model="primary" aria-label="Type principal" :disabled="disabled">
        <option v-for="t in meetingTypes" :key="t" :value="t">{{ labels[t] }}</option>
      </select></label
    ><label
      >Deuxième type (facultatif)<select
        v-model="secondary"
        aria-label="Deuxième type (facultatif)"
        :disabled="disabled"
      >
        <option value="">Aucun</option>
        <option v-for="t in meetingTypes.filter((t) => t !== primary)" :key="t" :value="t">
          {{ labels[t] }}
        </option>
      </select></label
    >
  </div>
</template>
