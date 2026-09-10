<script setup lang="ts">
import { ref } from 'vue';
import { newMeeting, meetingSchema, type Meeting } from '../domain/models';
import MeetingTypes from './MeetingTypes.vue';
import MeetingLocation from './MeetingLocation.vue';
const emit = defineEmits<{ save: [Meeting] }>();
const m = ref(newMeeting());
const error = ref('');
function submit() {
  const v = meetingSchema.safeParse(m.value);
  if (!v.success) {
    error.value = 'Vérifiez la date et l’heure.';
    return;
  }
  emit('save', v.data);
}
</script>
<template>
  <form class="form-grid" @submit.prevent="submit">
    <label class="full">Titre (facultatif)<input v-model="m.titre" maxlength="240" /></label
    ><MeetingTypes v-model:primary="m.type" v-model:secondary="m.typeSecondaire" /><label
      >Date<input v-model="m.date" type="date" required /></label
    ><label>Heure<input v-model="m.heureDebut" type="time" required /></label
    ><MeetingLocation v-model="m.lieu" />
    <p v-if="error" role="alert" class="error full">{{ error }}</p>
    <footer class="full"><button class="primary" type="submit">Créer la réunion</button></footer>
  </form>
</template>
