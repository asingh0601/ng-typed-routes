import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLinkActive, RouterOutlet } from '@angular/router';
import { TypedLinkDirective } from 'ng-typed-routes';
import { routes } from './routes.gen';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLinkActive, TypedLinkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav>
      <a [typedLink]="r.index" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Home</a>
      <a [typedLink]="r.users" routerLinkActive="active">Users</a>
      <a [typedLink]="r.settings.$section" [params]="{ section: 'account' }" [query]="{ tab: 'advanced' }" routerLinkActive="active">
        Settings
      </a>
    </nav>
    <main>
      <router-outlet />
    </main>
  `,
})
export class App {
  protected readonly r = routes;
}
