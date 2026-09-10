<script setup lang="ts">
import { computed } from 'vue';
import { eventCategoryClass, eventContainsDate, type AgendaEvent } from '../domain/models';
const props = defineProps<{ year: number; events: AgendaEvent[] }>();
const emit = defineEmits<{ selectDay: [date: string] }>();
const months = computed(() =>
  Array.from({ length: 12 }, (_, monthIndex) => {
    const first = new Date(props.year, monthIndex, 1);
    const offset = (first.getDay() + 6) % 7;
    return {
      label: first.toLocaleDateString('fr-FR', { month: 'long' }),
      days: Array.from({ length: 42 }, (_, index) => {
        const day = new Date(props.year, monthIndex, 1 - offset + index);
        const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        const dayEvents = props.events.filter((event) => eventContainsDate(event, date));
        return {
          date,
          day: day.getDate(),
          current: day.getMonth() === monthIndex,
          hasEvent: dayEvents.length > 0,
          categoryClass: dayEvents.map((event) => eventCategoryClass(event.categorie)).find(Boolean) || '',
        };
      }),
    };
  }),
);
</script>
<template>
  <div class="year-calendar">
    <section v-for="month in months" :key="month.label" class="year-month">
      <h3>{{ month.label }}</h3>
      <div class="year-weekdays">
        <span v-for="(d, index) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']" :key="index">{{ d }}</span>
      </div>
      <div class="year-days">
        <button
          v-for="day in month.days"
          :key="day.date"
          :class="[{ outside: !day.current, marked: day.hasEvent }, day.categoryClass]"
          :aria-label="day.date"
          @click="emit('selectDay', day.date)"
        >
          {{ day.day }}
        </button>
      </div>
    </section>
  </div>
</template>
