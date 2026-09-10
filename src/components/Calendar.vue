<script setup lang="ts">
import { computed } from 'vue';
import {
  eventCategoryClass,
  eventContainsDate,
  eventDateLabel,
  type AgendaEvent,
} from '../domain/models';
const props = defineProps<{ month: string; events: AgendaEvent[] }>();
const emit = defineEmits<{ select: [AgendaEvent] }>();
const cells = computed(() => {
  const [y, m] = props.month.split('-').map(Number),
    first = new Date(y, m - 1, 1),
    offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(y, m - 1, 1 - offset + i),
      date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      date,
      day: d.getDate(),
      current: d.getMonth() === m - 1,
      events: props.events.filter((e) => eventContainsDate(e, date)),
    };
  });
});
</script>
<template>
  <div class="calendar">
    <div v-for="d in ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']" :key="d" class="weekday">
      {{ d }}
    </div>
    <div v-for="c in cells" :key="c.date" class="day" :class="{ outside: !c.current }">
      <span>{{ c.day }}</span
      ><button
        v-for="e in c.events"
        :key="e.id"
        class="calendar-event"
        :class="eventCategoryClass(e.categorie)"
        :title="`${e.titre} · ${eventDateLabel(e)}`"
        @click="emit('select', e)"
      >
        {{ e.titre }}
      </button>
    </div>
  </div>
</template>
