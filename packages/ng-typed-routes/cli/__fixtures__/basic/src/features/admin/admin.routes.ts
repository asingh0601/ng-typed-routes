import { Routes } from '@angular/router';
import { Home } from '../../home';

const ADMIN_ROUTES: Routes = [
  { path: '', component: Home },
  { path: 'reports', component: Home },
];

export default ADMIN_ROUTES;
