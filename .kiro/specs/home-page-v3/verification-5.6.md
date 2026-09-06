# Task 5.6 — E2E / regression verification

Live browser E2E (Playwright) cannot run in this environment (Node 22 vs the
repo's Node 24; no browser binaries). The full production `next build` also
cannot run here — it fails only at the `pre:styles-bulk-export` prehook
(`build-bulk-export-css.ts` needs Node 24), unrelated to home-page-v3. Both run
normally in the Docker production build.

Each 5.6 scenario is decomposed into the automated coverage that verifies its
parts, plus the manual browser step to run against the deployed image.

## Scenario 1 — admin reorders + hides a widget → reflected for a user with no personal prefs
- `resolve-widget-layout.spec.ts` — site config overrides order/visibility; a
  site-hidden widget is dropped (Req 5.3).
- `HomeWidgets.spec.tsx` — renders from the resolved layout: `siteConfig={{ bookmarks:{visible:false} }}` → bookmarks absent; reorder via `homeFeed.order` moves it before search.
- `customize-setting.integ.ts` — `PUT /customize-setting/home-widgets` persists the 3 keys (real Mongo) + audit activity `ADMIN_HOME_WIDGETS_UPDATE`.
- `get-home-widgets-config.spec.ts` — SSR reads the 3 keys into page props.
- **Manual:** admin Customize → Home widgets → reorder + hide one → Save; open `/home` as a non-customized user → order/visibility match.

## Scenario 2 — user reorders/hides on their `/home` → persists after reload; reset → follows site config
- `HomeWidgetCustomizePanel.spec.tsx` — Save sends the whole `homeWidgetPreferences` map (every key with explicit order); Reset sends `{}`; save failure keeps edits + toasts.
- `HomeWidgets.spec.tsx` — customize mode: all 7 frames render (incl. hidden, with placeholder), ↑/↓ disabled at ends, callbacks fire.
- `user-ui-settings.integ.ts` (task 5.4) — real Mongo: `homeWidgetPreferences` persists for the authenticated user; a second PUT with `{}` resets it; another user's doc is unaffected.
- `HomeContent.spec.tsx` / `index.page.tsx` — the SSR-hydrated `userUISettings.homeWidgetPreferences` flows to `HomeWidgetCustomizePanel` → `HomeWidgets` (so a reload re-applies it).
- **Manual:** on `/home` click カスタマイズ → move/hide widgets → 保存 → reload the page → layout kept → 初期状態に戻す → back to the site-config layout.

## Scenario 3 — guest opens `/home` → no widget area, only notice + requirements table
- `HomeContent.spec.tsx` — `useCurrentUser() === undefined` → no `HomeWidgetCustomizePanel`; `SystemRequirementsTable` + notice branch still render; `HomeHero` still renders.
- **Manual:** open `/home` logged out → hero + notice (or admin hint hidden for guests) + requirements table; no widgets, no カスタマイズ button.

## Scenario 4 — `/home` continuity (non-editable standalone page, nav icon, post-login redirect, bottom notice + requirements table)
- `is-creatable-page.spec.ts` (task 4.4) — `isCreatablePage('/home') === false`, `/home/sub` false, `/home-notice` still true.
- `20260906120000-warn-existing-home-page.spec.js` — startup migration warns (no mutation) when a `/home` page exists.
- `home-notice-hint-i18n.spec.ts` + `HomeContent.spec.tsx` — bottom notice: rendered when `customize:homeNotice` set; admin-only hint when empty; hidden for non-admins.
- v2, unchanged by v3: `HomeNavItem` (sidebar nav icon), `login.js` post-login `redirectTo='/home'` fallback, `get-home-notice.ts`, `SystemRequirementsTable`.
- **Manual:** `/home` shows no editor / edit button; sidebar Home icon navigates to it; log in with no `?next=` → lands on `/home`; bottom shows notice + min/rec requirements table.

## Build / boot
- `turbo run build --filter '@growi/app^...'` (workspace deps incl. rebuilt `@growi/core` with the `/home` restriction) — green.
- `lint:typecheck` (whole app, ~1142 files) — only the 11-file pre-existing baseline (fork mastra deepseek specs + `attendance-status.spec.ts`); zero new errors from home-page-v3.
- Full home-page-v3 test sweep — 337 passed / 2 pre-existing unrelated failures (`UsersHomepageFooter` badges i18n).
- Production `next build` + `server:ci` boot smoke: run at Docker image build (Node 24).
