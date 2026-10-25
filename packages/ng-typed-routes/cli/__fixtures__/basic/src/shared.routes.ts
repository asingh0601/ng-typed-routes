import { Routes } from '@angular/router';
import { Home } from './home';

export const SHARED_ROUTES: Routes = [
  { path: 'help', component: Home, children: [{ path: 'faq', component: Home }] },
];
