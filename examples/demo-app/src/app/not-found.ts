import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TypedLinkDirective } from 'ng-typed-routes';
import { routes } from './routes.gen';

@Component({
  imports: [TypedLinkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Not found</h1>
    <a [typedLink]="r.index">Back home</a>
  `,
})
export class NotFound {
  protected readonly r = routes;
}
