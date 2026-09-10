<script setup lang="ts">
import { ref, nextTick, useId } from 'vue';
import { Bold, Italic, Underline, Highlighter, List, ListOrdered } from 'lucide-vue-next';
const props = defineProps<{
  modelValue: string;
  label: string;
  disabled?: boolean;
  rows?: number;
  transform?: (text: string, cursor: number) => { text: string; cursor: number } | null;
}>();
const fieldId = useId();
const emit = defineEmits<{ 'update:modelValue': [string] }>();
const el = ref<HTMLTextAreaElement>();
function apply(next: string, selectionStart: number, selectionEnd: number) {
  emit('update:modelValue', next);
  void nextTick(() => {
    const node = el.value;
    if (!node) return;
    node.value = next;
    node.focus();
    node.selectionStart = selectionStart;
    node.selectionEnd = selectionEnd;
  });
}
// Wraps the current selection with markers (bold/italic/highlight, or the <u></u>
// tags Markdown itself falls back to for underline); with nothing selected, the
// markers land around the cursor so typing continues inside them.
function wrap(before: string, after: string = before) {
  const node = el.value;
  if (!node || props.disabled) return;
  const { selectionStart: start, selectionEnd: end, value } = node;
  const selected = value.slice(start, end);
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  apply(next, start + before.length, start + before.length + selected.length);
}
// Prefixes every line touched by the selection with a list marker, numbering ordered
// items in order regardless of how many lines are selected.
function list(ordered: boolean) {
  const node = el.value;
  if (!node || props.disabled) return;
  const { selectionStart: start, selectionEnd: end, value } = node;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = value.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const prefixed = lines.map((line, i) => (ordered ? `${i + 1}. ` : '- ') + line).join('\n');
  const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  apply(next, lineStart, lineStart + prefixed.length);
}
function onInput(event: Event) {
  const node = event.target as HTMLTextAreaElement;
  const result = props.transform?.(node.value, node.selectionStart ?? node.value.length);
  if (result) apply(result.text, result.cursor, result.cursor);
  else emit('update:modelValue', node.value);
}
</script>
<template>
  <div class="rich-textarea">
    <label :for="fieldId">{{ label }}</label>
    <div class="rich-toolbar" role="toolbar" aria-label="Mise en forme">
      <button type="button" title="Gras" aria-label="Gras" :disabled="disabled" @click="wrap('**')">
        <Bold :size="14" /></button
      ><button
        type="button"
        title="Italique"
        aria-label="Italique"
        :disabled="disabled"
        @click="wrap('*')"
      >
        <Italic :size="14" /></button
      ><button
        type="button"
        title="Souligné"
        aria-label="Souligné"
        :disabled="disabled"
        @click="wrap('<u>', '</u>')"
      >
        <Underline :size="14" /></button
      ><button
        type="button"
        title="Surligné"
        aria-label="Surligné"
        :disabled="disabled"
        @click="wrap('==')"
      >
        <Highlighter :size="14" /></button
      ><button
        type="button"
        title="Liste à puces"
        aria-label="Liste à puces"
        :disabled="disabled"
        @click="list(false)"
      >
        <List :size="14" /></button
      ><button
        type="button"
        title="Liste numérotée"
        aria-label="Liste numérotée"
        :disabled="disabled"
        @click="list(true)"
      >
        <ListOrdered :size="14" />
      </button>
    </div>
    <textarea
      :id="fieldId"
      ref="el"
      :value="modelValue"
      :disabled="disabled"
      :rows="rows"
      @input="onInput"
    />
  </div>
</template>
