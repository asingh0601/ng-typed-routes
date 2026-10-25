import { ChangeDetectionStrategy, Component } from '@angular/core';
import { injectParams } from 'ng-typed-routes';
import { routes } from '../routes.gen';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Profile of user {{ id() }}</p>`,
})
export class UserProfile {
  // Reads the parent's :id without paramsInheritanceStrategy.
  protected readonly id = injectParams(routes.users.detail.profile).id;
}
