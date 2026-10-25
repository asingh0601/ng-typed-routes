import { Routes } from '@angular/router';
import { Home } from '../../home';

export const CART_ROUTES: Routes = [
  { path: '', component: Home },
  { path: 'checkout', component: Home },
];
