import { Routes } from '@angular/router';
import type { TypedRoute } from 'ng-typed-routes';
import { Home } from './home';
import { SHARED_ROUTES } from './shared.routes';

const legal = { path: 'legal', component: Home };

export const routes: Routes = [
  { path: '', component: Home, pathMatch: 'full' },
  { path: 'about-us', component: Home },
  {
    path: 'users',
    loadChildren: () => import('./features/users/users.routes').then((m) => m.USERS_ROUTES),
  },
  {
    path: 'admin',
    loadChildren: () => import('@features/admin'),
  },
  {
    path: 'shop',
    loadChildren: () => import('./features/shop/index').then(({ SHOP_ROUTES }) => SHOP_ROUTES),
  },
  { path: 'settings/profile', component: Home },
  { path: 'settings/:section/advanced', component: Home },
  {
    path: 'search',
    component: Home,
  } satisfies TypedRoute<{ query: { q?: string; sort?: 'asc' | 'desc'; tags?: string[]; page?: number; exact?: boolean; ids?: number[] }; data: { title: string } }>,
  { path: 'chat', outlet: 'aux', component: Home, children: [{ path: ':room', component: Home }] },
  legal,
  ...SHARED_ROUTES,
  { path: 'old', redirectTo: 'about-us' },
  { path: '**', component: Home },
];
