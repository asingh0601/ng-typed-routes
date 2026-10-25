# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to version and publish `ng-typed-routes`.

- `npx changeset` — describe your change (patch / minor / major) in a new file here.
- On merge to `main`, the release workflow opens a "Version Packages" PR that bumps versions and updates `CHANGELOG.md`.
- Merging that PR builds and publishes `packages/ng-typed-routes/dist` to npm.
