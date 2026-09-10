import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './styles/main.css';
// Dashboard loads eagerly (it's the first screen almost every time); the rest is
// fetched on first visit only, so the initial bundle stays small.
import Dashboard from './views/Dashboard.vue';
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/reunions', component: () => import('./views/Meetings.vue') },
    { path: '/reunions/:id', component: () => import('./views/MeetingDetail.vue') },
    { path: '/agenda', component: () => import('./views/Entities.vue'), props: { kind: 'agenda' } },
    {
      path: '/membres',
      component: () => import('./views/Entities.vue'),
      props: { kind: 'membres' },
    },
    {
      path: '/actions',
      component: () => import('./views/Entities.vue'),
      props: { kind: 'actions' },
    },
    { path: '/documents', component: () => import('./views/Documents.vue') },
    { path: '/parametres', component: () => import('./views/Settings.vue') },
    { path: '/notes', component: () => import('./views/Notes.vue') },
    { path: '/glossaire', component: () => import('./views/Glossaire.vue') },
  ],
});
createApp(App).use(router).mount('#app');
