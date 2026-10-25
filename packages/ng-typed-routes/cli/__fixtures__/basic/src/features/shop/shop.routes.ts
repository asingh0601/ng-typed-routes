import { Routes } from '@angular/router';
import { Home } from '../../home';

export const SHOP_ROUTES: Routes = [
  { path: 'products', component: Home },
  { path: 'products/:slug', component: Home },
  { path: 'cart', loadChildren: () => import('./cart.routes').then((m) => m.CART_ROUTES) },
];
