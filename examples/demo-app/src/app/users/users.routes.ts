import { Routes } from '@angular/router';
import type { TypedRoute } from 'ng-typed-routes';
import { UserDetail } from './user-detail';
import { UserList } from './user-list';
import { UserOrders } from './user-orders';
import { UserProfile } from './user-profile';

export const USERS_ROUTES: Routes = [
  { path: '', component: UserList },
  {
    path: ':id',
    component: UserDetail,
    children: [
      { path: '', redirectTo: 'profile', pathMatch: 'full' },
      { path: 'profile', component: UserProfile },
      {
        path: 'orders',
        component: UserOrders,
      } satisfies TypedRoute<{ query: { status?: 'open' | 'shipped' } }>,
    ],
  } satisfies TypedRoute<{ name: 'detail' }>,
];
