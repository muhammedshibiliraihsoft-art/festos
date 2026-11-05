# Portal PWA branding

All app installs use the Festos name. The existing Team Leader and Team Management installs keep `team-manifest.json` and `team-management-manifest.json` with their `installedPortal` start URLs and route protection. The Stage venue route keeps its distinct app ID and start URL. Cloudflare Pages serves the dynamic route from `functions/portal-manifest.ts`; Vercel uses `api/portal-manifest.ts` and its explicit rewrite. Both derive asset and start URLs from the request origin, so changing the deployment domain requires no source edit.

All portal installs, touch icons, favicons, Expo icons, splash image, and portal headers use the updated Festos mark. iOS touch icons include 152, 167, and 180 pixel variants; Android has 192, 512, and maskable 512 pixel PNGs. The existing Main and Team install prompts remain in use; `PwaInstallCard` serves the Stage venue page.

QR and copied browser links use the current origin. Native builds have no browser origin; set `EXPO_PUBLIC_APP_ORIGIN` to the public HTTPS app origin when building a native app to enable external QR links. This branding change does not modify tenant data, authorization, or database schema.
