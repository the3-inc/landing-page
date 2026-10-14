# landing-page

Company website for the3-inc, built with Astro and static site generation (SSG).
Product websites and demos are deployed independently on subdomains and linked
with ordinary links from this site. Add their URLs when the destinations are known.

## Development

Use Node.js 24.21.0 (recorded in `.node-version`) and pnpm 12.11.2
(recorded in `package.json`). The version files do not switch Node.js automatically.

```sh
pnpm install --frozen-lockfile
pnpm exec lefthook install
pnpm dev
```

The development server runs at `http://localhost:4321` by default.
Edit `src/pages/index.astro` to update the homepage. Add pages under `src/pages/`
and place assets that should be copied unchanged under `public/` when needed.

## Validation and build

```sh
pnpm run check
pnpm run typecheck
pnpm test
pnpm build
pnpm preview
```

`pnpm run fix` applies formatting and safe lint fixes. Review the diff and stage
the changes again before committing. The pre-commit hook only checks staged files.

`typecheck` uses `astro check` to cover Astro and TypeScript files. TypeScript 6
is pinned because the installed `@astrojs/check` supports TypeScript 5 and 6.
`build` checks types before generating static files in `dist/`; `preview` serves
that build locally. The Vitest smoke test builds the homepage into a temporary
directory and checks that the HTML is present without client scripts.

Astro is explicitly configured with `output: "static"`. No server adapter or
frontend framework is needed for this initial page. Set `site` in
`astro.config.mjs` when the company's production URL is decided.
CI, AWS resources, DNS, and deployment are not configured yet.
