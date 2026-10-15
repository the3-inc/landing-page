# landing-page

Company website for the3合同会社, built with Astro, Tailwind CSS 4, and static site generation (SSG).
Product introductions will live under `/products/<name>/` in this company site.
Product applications and demos will run on their own subdomains, such as
`alpha.the3.co.jp`, with a dedicated CloudFront distribution, S3 or Lambda origin,
and release workflow per product. Introduction pages link to those applications.

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
The site has three pages: `/` for the philosophy and business introduction,
`/company/` for company information and access, and `/contact/` for email and
phone contact. Philosophy copy appears only on the homepage. All pages use
normal scrolling and content heights, with no full-screen sections or scroll
snapping. The shared header, footer, metadata, and development theme selector
live in `src/layouts/SiteLayout.astro`. Brand colors and base styles live in
`src/styles/global.css`; Tailwind utilities are compiled through
`@tailwindcss/vite` in `astro.config.mjs`.
The layout adapts to mobile and desktop. In development (`pnpm dev`), the display
selector offers light, dark, and system themes (the default), remembers an
explicit choice in local storage, and follows system changes in system mode.
The selector and its inline script are excluded from production builds and
`pnpm preview`; production follows the system theme through CSS, with no client
scripts or saved development preferences.

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
that build locally. The Vitest smoke test builds all three pages into a temporary
directory and checks the page content, shared navigation, unique homepage
philosophy, contact and map links, compiled styles, and the absence of production
client scripts and development controls. Theme tests cover system changes,
saved choices, and unavailable storage.

Astro is explicitly configured with `output: "static"`. No server adapter or
frontend framework is needed for this initial page. The production URL is `https://the3.co.jp`, configured as `site` in
`astro.config.mjs`.

## CI, Terraform and AWS deployment

GitHub Actions checks pull requests and `main` with lint, tests, a production build,
and Terraform fmt/validate/provider-mock tests without AWS credentials.
Terraform CLI 1.16.6 and AWS provider 6.69.0 are pinned; commit each root's provider
lock file. `infra/foundation` owns account-wide GitHub OIDC and publishes three
non-secret identifiers to versioned SSM parameters. `infra/company` reads that
contract and owns the company S3, CloudFront, certificate, DNS records and release
role in one independent state. Product repositories read the same SSM contract
and own separate state, product resources and release workflows.

See [infrastructure setup and operations](infra/README.md) for offline checks,
backend bootstrap, reviewed plan/apply commands, existing-resource migration,
SSM consumer examples, GitHub settings, product onboarding and recovery limits.
The existing Route 53 zone is referenced, not recreated. The two roots use separate
S3 backend keys with encryption and locking. Infrastructure changes use administrative
credentials and explicit plan/apply; release workflows have no infrastructure
management or state access.

After infrastructure and GitHub protection settings are complete, push an immutable
`vMAJOR.MINOR.PATCH` tag from a commit on `main`. The production workflow builds and
uploads the company site, invalidates only its distribution, then verifies the three
existing public pages. Set `AWS_ACCOUNT_ID`, `AWS_REGION`, `SITE_BUCKET`,
`DISTRIBUTION_ID` and `AWS_ROLE_ARN` from company Terraform outputs in the `production`
Environment. Existing release tags can be redeployed manually from `main` to roll back.
No Terraform apply is triggered by release tags.

Product introduction pages are not created yet. When adding `/products/` pages,
extend the content tests and public URL checks. Product applications use their own
subdomains, certificates, CloudFront distributions, origins and release roles.
