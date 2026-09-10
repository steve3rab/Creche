<script setup lang="ts">
import { ref, watch } from 'vue';
const value = defineModel<string>({ required: true });
defineProps<{ disabled?: boolean }>();
const custom = ref(!['À la crèche', 'En ligne'].includes(value.value)),
  lastCustom = ref(custom.value ? value.value : '');
watch(value, (v) => {
  if (v === 'À la crèche' || v === 'En ligne') custom.value = false;
  else {
    custom.value = true;
    lastCustom.value = v;
  }
});
function choose(e: Event) {
  custom.value = (e.target as HTMLSelectElement).value === 'autre';
  value.value = custom.value
    ? lastCustom.value
    : (e.target as HTMLSelectElement).value === 'ligne'
      ? 'En ligne'
      : 'À la crèche';
}
</script>
<template>
  <div class="full form-grid location-field">
    <label
      >Lieu<select
        :value="custom ? 'autre' : value === 'En ligne' ? 'ligne' : 'creche'"
        aria-label="Choix du lieu"
        :disabled="disabled"
        @change="choose"
      >
        <option value="creche">À la crèche</option>
        <option value="ligne">En ligne</option>
        <option value="autre">Saisir un autre lieu</option>
      </select></label
    ><label v-if="custom"
      >Autre lieu<input
        v-model="value"
        aria-label="Autre lieu"
        placeholder="Salle associative, adresse…"
        :disabled="disabled"
        maxlength="240"
    /></label>
  </div>
</template>
