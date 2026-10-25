import { Routes } from '@angular/router';
import type { TypedRoute } from 'ng-typed-routes';
import { Home } from '../../home';

export const USERS_ROUTES: Routes = [
  {
    path: '',
    component: Home, // layout route: transparent
    children: [
      { path: '', component: Home },
      {
        path: ':id',
        component: Home,
        children: [
          { path: '', component: Home },
          { path: 'orders', component: Home } satisfies TypedRoute<{ query: { tab?: 'open' | 'closed' } }>,
          { path: 'orders/:orderId', component: Home },
        ],
      } satisfies TypedRoute<{ name: 'detail' }>,
    ],
  },
];
