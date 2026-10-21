# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

`dmbk-photo` is the photo gallery and its admin, served at **photo.dmbk.io**. It is a Next.js 16 App Router app deployed on Vercel. It moved out of the `dmbk` portfolio app (`../dmbk`), which now redirects `dmbk.io/photos` and `dmbk.io/admin/*` here.

## Commands

Use **pnpm**.

```bash
pnpm dev               # relay + next dev
pnpm build             # relay + next build
pnpm lint              # eslint
pnpm typecheck         # relay + tsc --noEmit
pnpm relay             # compile the admin's Relay operations (relay.config.json)
pnpm theme             # recompile the Reshaped theme from reshaped.config.mjs into src/themes/photo/
pnpm schema:pull:api   # pull the dmbk GraphQL API's schema into schemas/
pnpm verify:admin      # headless admin UI verification against a local API (see below)
```

## Routes

| Route | What |
|---|---|
| `/` | Public gallery. Rendered per request; the API reads use Next's fetch cache (60 s) |
| `/photos` | 308 to `/` (`next.config.ts`), for links carried over from dmbk.io |
| `/admin` | Sign-in, then a redirect to `/admin/upload` |
| `/admin/upload`, `/admin/photos`, `/admin/photos/[id]` | Upload, the library, and the edit view |
| `/api/session` | Trades a Google ID token for an API session and keeps it in an HTTP-only cookie |
| `/api/admin/graphql` | Same-origin proxy that forwards persisted Relay operations with the session's bearer token |

## Design system

- **The whole app is Reshaped**, unscoped. `src/app/layout.tsx` server-renders `data-rs-theme="photo"` and the colour-mode attribute on `<html>`, because Reshaped sets them itself only from an effect after mount. `COLOR_MODE_SCRIPT` (`src/app/theme.ts`) runs in `<head>` and switches to the system colour mode before first paint. `ThemeProvider` then follows `prefers-color-scheme` live.
- **Theme `photo`** is compiled by `pnpm theme` from `reshaped.config.mjs` into `src/themes/photo/`. That output is generated, but it is checked in. Colours and radii come from lora-trainer's `lora-trainer` theme: a monochrome ramp with square corners. Every font family is `var(--font-areal)`.
- **Font: ABCAreal**, the face that sigil-x-native-interviews' `/sketches` section inherits from that site's root layout. It is self-hosted from `src/fonts/` through `next/font/local` (`src/app/fonts.ts`), which sets `--font-areal` on `<html>`.
- **`postcss.config.mjs` is required.** Reshaped ships unresolved `@media (--rs-viewport-*)` custom media. Without the config, every responsive component renders at its narrowest. The config reads `src/themes/photo/media.css` relative to `process.cwd()`, because Turbopack bundling breaks Reshaped's own path lookup.
- The gallery's masonry and fullscreen stage have no Reshaped component. Their geometry lives in `src/components/photos/gallery.module.css` and reads `--rs-*` tokens for anything visual. The column bands and the gap are duplicated in `src/lib/photos/gallery-constants.ts`, which the layout math reads. Change both together.
- **Relay and react-dropzone are admin-only.** ESLint refuses them outside `src/app/admin/` and `src/components/admin/`. The react-query and Relay providers are mounted in `src/app/admin/layout.tsx`, so the gallery's bundle carries neither.

## Data and auth

Every read and write goes to the dmbk GraphQL API (`../dmbk-graphql-api`, `graphql.dmbk.network`). That API owns the `dmbk-photos` database, the `dmbk-io` Space and the accounts. This app opens no database connection.

- **Public reads** go straight to the API, anonymously. `src/lib/photos/api.ts` holds the hand-written `dmbkPhotos` / `dmbkPhotosKeywords` / `node` documents. The page renders the first page on the server, and the browser continues with the same module. The API's CORS list (`ALLOWED_ORIGINS`) admits `*.dmbk.io` and `localhost:3000`. From any other dev origin the first page renders, but loading more fails with "Failed to fetch".
- **Admin reads and writes** are Relay operations. They're posted as persisted ids to `/api/admin/graphql`, which checks that the request is same-origin and carries the session cookie, looks the id up in `src/server/admin-graphql/persisted-operations.json`, and forwards it with `Authorization: Bearer <token>`. The token never reaches page scripts. `pnpm relay` goes through `scripts/relay.mjs` because the compiler refuses to start until the persisted file exists. Both that file and `__generated__/` are git-ignored and rebuilt by every `dev` and `build`. `relay.config.json` and `compiler.relay` in `next.config.ts` must agree.
- **Sign-in**: `SignIn.tsx` renders Google Identity Services' button. `/api/session` trades the ID token through the API's `signInWithGoogle`, refuses non-admins (the API's `ADMIN_EMAILS`), and sets the `dmbk_admin_session` cookie. Every session check asks the API `viewer { isAdmin }`, uncached. Google renders its button only on **authorized JavaScript origins** of the accounts API's OAuth client: `https://photo.dmbk.io` and `http://localhost:3000`. Vercel preview URLs therefore cannot sign in.
- **Uploads** PUT bytes from the browser straight to the Space via a presigned URL. The Space's CORS rules must allow `PUT` from `https://photo.dmbk.io` and `http://localhost:3000`.
- `AdminShell` is a usability gate, not a security boundary. The API enforces the admin scope on every operation.
- `src/lib/photos/constants.ts` is the browser's copy of the API's upload types and its 50 MB limit. Keep it identical to the API's, and keep it dependency-free.

## Verification

`pnpm verify:admin` drives the real admin screens against a **local** `dmbk-graphql-api` (`VERIFY_API_URL`, default `http://localhost:4000/graphql`; checkout at `VERIFY_API_REPO`, default `../dmbk-graphql-api`). Before running it:

1. Run `pnpm build`.
2. Free port 3000. The Space's CORS allows browser PUT from there.
3. In the API repo, run `npm run test:mutations -- --setup` once, then `npm run dev`.

The script mints sessions for the API's `.invalid` test admin, deletes only the photos it created, and removes the test account at the end.

## Environment

See `.env.example`. The app itself needs only `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. `DMBK_GRAPHQL_API_URL` is optional and **defaults to production**, so a local run reads, uploads, edits and deletes production photos unless you override it.

## Maintenance scripts

```bash
node --env-file=.env.local scripts/recount-keywords.mjs            # repair keyword counts
node --env-file=.env.local scripts/cleanup-pending-photos.mjs      # drop abandoned uploads (--dry-run)
node --env-file=.env.local scripts/backfill-grid-derivative.mjs    # generate the 1000px grid variant (--dry-run)
```

These scripts open `dmbk-photos` and the Space directly. Run them with `MONGODB_URI` and `DO_SPACES_*` set to the API's credentials.
