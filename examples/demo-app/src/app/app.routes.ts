import { Routes } from '@angular/router';
import type { TypedRoute } from 'ng-typed-routes';
import { Home } from './home';
import { NotFound } from './not-found';
import { Settings } from './settings';

export const routes: Routes = [
  { path: '', component: Home, pathMatch: 'full' },
  {
    path: 'users',
    loadChildren: () => import('./users/users.routes').then((m) => m.USERS_ROUTES),
  },
  {
    path: 'settings/:section',
    component: Settings,
  } satisfies TypedRoute<{ query: { tab?: 'general' | 'advanced' } }>,
  { path: '**', component: NotFound },
];
