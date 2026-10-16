# KDSCAD website

Static HTML/CSS/JavaScript site deployed by the existing Vercel Git integration.

`npm run build` copies the 24 intended public files into `public/`. Vercel serves that build output; repository archives, PDFs, test tools, and unused source images are excluded. The build itself has no package dependencies.

## Validation

Requires Node.js 22 or later.

```sh
npm ci
npx playwright install chromium
npm test
npm run test:browser
```

The browser suite starts a local static server and verifies public routes, mobile navigation, contact links, responsive images, QR display, vCard download, sharing, offline behavior, and migration from the original service worker. Reports and screenshots are written to `test-results/`.

Set `BASE_URL=https://kdscad.com` to run the public-site checks against production. The legacy-worker migration fixture runs only locally. Email and telephone checks validate link destinations; they do not send messages or place calls.

If a sandbox prevents Chromium from saving native downloads, set `SKIP_NATIVE_DOWNLOAD=1` to run the remaining checks. The report explicitly marks native saving as skipped; HTTP and offline vCard payload checks still run. Verify Save Contact manually in a normal browser in that case.

## Offline business card

`michael/service-worker.js` uses network-first loading for a finite list of public card assets. Only successful same-origin responses are persisted. Queries for these static files share a cache key; unknown URLs bypass the worker. Offline documents use the cached card, while missing assets fail rather than receiving HTML.

Only caches prefixed `kds-michael-` are removed during upgrades. Increment the cache version when changing the precache list or requiring a fresh offline snapshot. The worker always checks the network while online, even without a version change.

## Content and publishing

Contact details come from the existing public business card. Published project case studies are not available; the project planning page says so explicitly. Do not replace this with invented client work.

`vercel.json` supplies a same-origin Content Security Policy, MIME protection, referrer policy, and worker revalidation. If adding external resources, review the relevant policy directive explicitly. The site does not have a server-side contact form; email links open the visitor’s email application.
