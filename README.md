# landing-page

Company website for the3-inc, built with Astro and static site generation (SSG).
Product websites and demos will be deployed independently from separate repositories
on subdomains, and this site will link directly to their public URLs.

## Development

Use Node.js 24.21.0 (recorded in `.node-version`) and pnpm 12.11.2
(recorded in `package.json`). The version files do not switch Node.js automatically.

```sh
pnpm install --frozen-lockfile
pnpm exec lefthook install
pnpm dev
```

The development server runs at `http://localhost:4321`.

```sh
pnpm run check
pnpm run typecheck
pnpm run build
pnpm preview
```

`pnpm run fix` applies formatting and safe lint fixes. Review the diff and stage
the changes again before committing. The pre-commit hook only checks staged files.

Edit `src/pages/index.astro` to update the company homepage. Add other pages under
`src/pages/`. Type checking uses `astro check` to check Astro and TypeScript files.
TypeScript 6 is used because `@astrojs/check` currently supports TypeScript 5 and 6.
Biome checks the file formats it supports; `.astro` files are checked by Astro.

Vitest remains available via `pnpm test` for application logic added later. No unit
tests exist yet, so that command currently exits with a "No test files found" error.

## Static deployment

`pnpm run build` generates static files in `dist/`. Deploy that directory to the
company site's S3 bucket and serve it through CloudFront. No server adapter or
Node.js server is required in production. `pnpm preview` is for local verification.

Set `site` in `astro.config.mjs` to the real company URL once the domain is chosen.
Do not use example product URLs as production links. AWS resources, DNS, deployment
CI, and redirects are not configured yet.
