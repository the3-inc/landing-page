# landing-page

Landing page for the3-inc.

## Development

Use Node.js 24.21.0 (recorded in `.node-version`) and pnpm 12.11.2
(recorded in `package.json`). The version files do not switch Node.js automatically.

```sh
pnpm install --frozen-lockfile
pnpm exec lefthook install
pnpm run check
pnpm run typecheck
pnpm test
```

`pnpm run fix` applies formatting and safe lint fixes. Review the diff and stage
the changes again before committing. The pre-commit hook only checks staged files.

The initial TypeScript and Vitest configuration targets Node.js. Add application
code under `src/` and tests under `tests/`, importing test APIs from `vitest`.
No application or tests exist yet: type checking currently covers the Vitest
configuration, and `pnpm test` fails until tests are added.
Frontend tooling, builds, CI, and deployment are not configured.
