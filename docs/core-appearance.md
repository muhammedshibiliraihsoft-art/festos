# Core appearance

Implemented for the Expo Web app and installed PWA. Native builds retain their previous appearance; the native settings route does not expose web-only theme controls.

## Scope and controls

Core Admin, its login, Superadmin, generic account settings/notifications for core users, and Stage Management (including the standalone venue PIN route) share the same palette. Admin Settings → Appearance and Superadmin → Appearance expose Light, Dark and System modes, six light palettes, a preview and Reset appearance.

Team Leader and Judge routes remain outside the appearance provider. Public pages and generic account screens for other roles retain their existing colour fallbacks. Judge/team management screens inside Admin are core screens; the separately accessed Judge and Team Leader portals are excluded.

| Light palette | Primary | Background | Surface |
|---|---|---|---|
| Teal | `#0F766E` | `#F3F8F7` | `#FAFCFB` |
| Royal Blue & Cream | `#014BAA` | `#F3F6FB` | `#FAFBFD` |
| Plum & Milk | `#381932` | `#FAF5F8` | `#FDF9FB` |
| Wine & Sand | `#7F011F` | `#FCF6F3` | `#FEFAF7` |
| Forest & Leaf | `#064734` | `#F4F9F0` | `#FAFCF7` |
| Burnt Orange | `#C2410C` | `#FCF6EF` | `#FEFAF5` |

Dark mode is identical for all light presets: background `#0B0D10`, surface `#161A20`, sidebar `#101318`, text `#E8ECF2`, primary action `#3659A3`, and primary foreground/link `#A8C1FF`. Status colours retain success/warning/error/info meanings. Light status foregrounds are adjusted for readable contrast.

## State and rendering flow

Settings selection → `coreAppearanceStore` → `CoreAppearanceContext` → scoped CSS variables → inline styles and NativeWind utilities. The single palette definition is `src/constants/coreThemeTokens.json`; `designSystem.ts` and `scripts/core-theme-colors.cjs` consume it.

The preference belongs to this browser/device, not an account or tenant. `core-appearance-v1` stores only validated `mode` and `palette`. Default: Teal + Light. Saved web preferences are read synchronously; System follows the device scheme. Storage events update other Core/Stage tabs on the same origin. Storage failure leaves the preference active for the current session and displays a notice.

Existing module-level StyleSheets retain CSS variable references, so switching appearance does not require screen remounts or data refetches. `CoreModal` copies the scope into React Native web modal roots; Studio's DOM font popover copies it into its portal. Root notification overlays receive variables only on core routes. Browser background, colour scheme and theme-colour metadata are restored when leaving the provider.

Glass is restricted to major cards, navigation and popup/sheet surfaces: 97% surface opacity, 4px backdrop blur, soft border/shadow. Nested cards do not stack blur. Reduced-transparency preferences disable blur, and unsupported browsers retain nearly opaque surfaces. React Native Web shadow colours remain literal neutral values: CSS variable colours in `shadowColor` did not preserve shadow opacity in the fixture browser.

## Output and compatibility safeguards

- Existing API/service calls, auth guards, permissions, tenant IDs, schemas and migrations are unchanged. No new network request is needed for appearance.
- Existing template storage keys and saved template formats are unchanged. Chest-card defaults, QR colours, card rendering and print subtrees use literal legacy output colours; appearance variables are not saved into template data.
- Print media resets the colour variables. Poster canvas/offscreen rendering, template swatches, distinct chart series/medals and WhatsApp branding intentionally preserve their own colours.
- UI colour literals retain their previous value as a fallback outside Core. The deprecated, unused `ThemeContext` and its old storage key are not activated or migrated.

## Coverage and validation

`scripts/core-theme-scope.json` records the current 133 UI modules. The audit checks that all current Admin/Superadmin/Auth routes are represented and flags remaining direct UI colour literals/utilities. Its reviewed exceptions are document output code, data colours, chart series, swatches, fixed neutral shadows and the native notification LED colour. This is static coverage, not evidence that every authenticated screen was exercised with live data.

Commands:

```text
npm run audit:appearance
npm run test:appearance
npm run build:web
node scripts/check-core-theme-types.cjs
node scripts/check-core-theme-lint.cjs
npm run preview:appearance
```

The preview requires a web build for its CSS/fonts. It serves real components on `127.0.0.1:8102` with explicit fixture services and no backend connection. It uses cached/npx esbuild 0.28.2 and the web Lucide renderer; no fixture/auth bypass is included in the production app.

Verified during implementation:

- Seven focused tests: malformed/safe preferences, six light palettes and common dark behaviour, contrast, variable/opacity validity, complete utility aliases, unchanged service/RPC calls and excluded portal sources, unchanged chest-card defaults/output.
- Web export succeeds. The source colour audit reports zero unresolved UI entries.
- TypeScript comparison against HEAD: 102 existing diagnostics before, 88 after, no newly introduced diagnostics. Full project typecheck remains failing on existing Admin imports, public leaderboard, font definitions, notification refs and Deno Edge Function typing issues.
- ESLint comparison: four pre-existing errors before/after; no new errors or warnings.
- Browser fixture: six Light palettes, common Dark, selected radio accessibility state, preference persistence, cross-tab Core/Stage sync, dropdown modal scope, selection retention, Stage PIN/empty state, and Team Leader/shared fallback isolation.
- Browser fixture widths 320, 390, 768 and 1366: no document horizontal overflow or overflowing palette/mode controls.

Live authenticated end-to-end flows, real-device/native tests and production deployment were not performed. The existing untracked `output/` tree was preserved.

## Core login layout

The core login uses centered Festos branding and a compact credentials form on the selected core background. The festival marketing hero, sector logo, and promotional cards are removed. Credential validation, auth service calls, and store updates remain unchanged. The public results link is removed from the login form; the public results route itself remains available. The isolated appearance fixture includes the real login UI with sign-in replaced by an explicit preview-only failure.

Login validation: production web export passed; 320/390/768/1366px fixture checks found no horizontal overflow. Required-field errors, password visibility, preview-only failed sign-in recovery, and common Dark colours were verified. Real backend sign-in was not exercised.

Integration validation: merged remote main through 35c2330, preserving its schedule, points, PWA, and Team Leader changes. Added its Core install prompt to the appearance audit and mapped its foreground and new schedule error text to semantic tokens. The chest-card comparison normalizes both baseline and current output aliases so it remains valid after the theme commit is recorded.
