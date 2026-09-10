<script setup lang="ts">
import Modal from './Modal.vue';
import { confirmation, answerConfirmation } from '../composables/confirmation';
</script>
<template>
  <Modal v-if="confirmation" title="Confirmer l’action" @close="answerConfirmation(false)">
    <p>{{ confirmation.message }}</p>
    <footer class="row">
      <button class="secondary" @click="answerConfirmation(false)">Annuler</button
      ><button class="primary" @click="answerConfirmation(true)">Confirmer</button>
    </footer>
  </Modal>
</template>
