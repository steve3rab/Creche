<script setup lang="ts">
import {
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  ExternalLink,
  Archive,
  RotateCcw,
  X,
  Plus,
  FileText,
} from 'lucide-vue-next';
defineProps<{ label: string; icon?: string; disabled?: boolean }>();
const icons = {
  edit: Pencil,
  delete: Trash2,
  up: ArrowUp,
  down: ArrowDown,
  copy: Copy,
  open: ExternalLink,
  archive: Archive,
  restore: RotateCcw,
  close: X,
  plus: Plus,
  pdf: FileText,
};
</script>
<template>
  <button type="button" class="icon-button" :aria-label="label" :title="label" :disabled="disabled">
    <component :is="icons[icon as keyof typeof icons] || Pencil" :size="16" />
  </button>
</template>
