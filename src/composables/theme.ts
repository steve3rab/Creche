import { ref, watch } from 'vue';

export type Theme = 'dark' | 'light';

function storedTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export const theme = ref<Theme>(storedTheme());

function apply(value: Theme) {
  document.documentElement.setAttribute('data-theme', value);
}
apply(theme.value);

watch(theme, (value) => {
  apply(value);
  try {
    localStorage.setItem('theme', value);
  } catch {
    // Navigation privée ou stockage désactivé : le choix ne persiste pas, sans bloquer le basculement.
  }
});

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
}
