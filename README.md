# Gym Tracker PWA

Mobile-first, no-build-step PWA for logging gym sets from NFC machine tags.

## Run locally

From this folder, run `npx serve .` and open the printed URL. A static server is required for ES modules and the service worker; opening `index.html` directly will not work. For UI-only testing, set `USE_MOCK = true` in [config.js](./config.js), then switch it back to `false` before deployment.

## Configure and deploy

The production webhook base is already set in [config.js](./config.js) to `https://gym-plus.app.n8n.cloud/webhook`. The API must allow CORS from the deployed site and implement:

- `POST /gym/enroll`: `{gym_id, phone_last4}` -> `{ok, member_token, name}`
- `POST /gym/set`: `{member_token, machine_id, weight_kg, reps, client_ts}` -> `{ok, set_number, rest_seconds, message}`

Deploy the folder as-is with Cloudflare Pages (create a Pages project and deploy the folder), Netlify (drag the folder into a site or connect the repository), or GitHub Pages (publish the repository root). Use the HTTPS URL for all deployments; service workers and PWA installation require a secure context (localhost is allowed for local testing).

Replace `icons/icon-192.png` and `icons/icon-512.png` with real PNG artwork at exactly 192x192 and 512x512 pixels before publishing. The manifest expects those paths. Do not put secrets or member tokens in this repository.

## NFC tags

Write a URL record to each tag with NFC Tools (or a similar app), for example:

`https://YOUR-SITE/?m=leg-press-02`

Use the machine's real ID in place of `leg-press-02`. Scan each tag on a phone and verify that the correct machine name appears.

## Test on phones

Use the HTTPS deployment URL. Test enrollment and set logging on one Android phone (Chrome) and one iPhone (Safari). Add the site to the home screen to test standalone PWA behavior. Also test airplane mode after a successful enrollment: log a set, reconnect, and confirm the queued set syncs.

## Troubleshooting

- **CORS:** Configure n8n webhook responses and/or a proxy to allow `POST` requests from your site origin, including the `Content-Type` header.
- **HTTPS/service worker:** A service worker will not register on an insecure deployed URL. Use the HTTPS URL, then reload after deployment.
- **Service worker updates:** Increment `CACHE_NAME` in `service-worker.js` when changing the shell, or unregister the old worker in browser site settings during development.
- **Mock mode:** `USE_MOCK = true` provides local enrollment and set responses without contacting n8n.
- **Stale identity:** Use “Not you?” in the footer to clear the saved member token and enroll again.
