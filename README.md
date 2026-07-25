# Annote

A small, self-hosted review layer for client websites. Add one script to any site, share a review code, and collect element-level feedback in an inbox your agency controls.

Annote is framework- and host-agnostic. A client site can be on WordPress, Webflow, Shopify, Laravel, Rails, Next.js, static HTML, or anywhere else JavaScript can load.

## What it does

- Floating, DOM-aware feedback widget with a review-code gate.
- Element-level comments that retain page URL, viewport, and selector context.
- Private agency inbox with resolve and reopen actions.
- Exact origin allowlist for every review project.
- Durable SQLite storage by default, suitable for a Docker volume.
- A plain JavaScript widget with no framework dependency.

## Run locally

```bash
npm install
npm run dev:api
npm run dev
```

Open `http://127.0.0.1:5173` for the marketing site, `http://127.0.0.1:5173/dashboard.html` for the inbox, and `http://127.0.0.1:5173/demo.html` for the client preview.

The first start imports the existing local starter data into `data/annote.db`. The local dashboard key is `annote-local`; the demo review code is `northstar`.

## Deploy anywhere with Docker

Set a strong dashboard key, then start Annote:

```bash
export ANNOTE_ADMIN_KEY="use-a-long-random-value"
docker compose up -d --build
```

This starts Annote on port `8787` and mounts a named Docker volume for `/data/annote.db`. Put it behind HTTPS at a domain you control, such as `https://feedback.youragency.com`.

The same image can run on a VPS, Railway, Render, Fly.io, DigitalOcean, or any Docker-capable host. The client site does not need to use the same host.

## Deploy on Vercel with Upstash

Docker is optional. Annote includes a Vercel Function backed by Upstash Redis, which is the simplest hosted setup for a small agency deployment.

1. Import this repository into Vercel.
2. In the Vercel Marketplace, install **Upstash Redis** and connect it to the Annote project. Vercel adds `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` automatically.
3. Add a strong `ANNOTE_ADMIN_KEY` environment variable in the Vercel project settings.
4. Deploy. Open `/dashboard.html`, enter the dashboard key, and create the first client review.

The Vercel deployment stores projects, annotations, and expiring review sessions in Upstash. It does not use the SQLite file. The Vercel Hobby and Upstash free tiers are suitable for personal testing and very small usage; review their terms and limits before using the tool for paid client work.

## Install on a client website

After deployment, paste this near the end of the client site page or layout:

```html
<script src="https://feedback.youragency.com/annote.js"></script>
<script>
  window.Annote.mount({
    reviewId: "acme-redesign",
    apiBase: "https://feedback.youragency.com"
  });
</script>
```

The widget uses the page's own DOM; it does not need an iframe, browser extension, or a specific frontend framework.

## Create a client review

Open the Annote dashboard and select **New project**. Enter a client-facing project name, a stable review ID, a review code, and every exact origin where the widget may run. Annote stores only the review code hash, so keep the original code to share with the client.

Select a project from the dashboard switcher at any time. Its **Setup** view provides the correct widget snippet for that review.

## Test against another local website

Keep both Annote processes running:

```bash
npm run dev:api
npm run dev
```

For a local client app at `http://localhost:3000`, add that exact origin to the project configuration, then add this to the client page:

```html
<script type="module">
  import { Annote } from "http://127.0.0.1:5173/src/widget.ts";

  Annote.mount({
    reviewId: "northstar-preview",
    apiBase: "http://127.0.0.1:8787"
  });
</script>
```

## Storage and configuration

`ANNOTE_DATABASE_PATH` controls the SQLite file location and defaults to `data/annote.db`. For Docker it is `/data/annote.db`, which must be backed by a persistent volume.

The current starter imports `data/annote.json` once when the database is empty, including the demo project. It never overwrites an existing database. Create all subsequent projects through the dashboard.

When deployed to Vercel, Annote uses Upstash instead. The local SQLite database is not uploaded or used by Vercel.

Set the dashboard key before any real deployment:

```bash
ANNOTE_ADMIN_KEY="use-a-long-random-value" npm start
```

For sensitive environments, protect the client preview itself with staging authentication. The review code is a lightweight invitation gate, not a replacement for access control.

## Roadmap

The next interaction upgrades are resilient text re-anchoring, an annotation drawer, keyboard shortcuts, and export/import. Annote will implement those ideas independently while retaining its own compact, agency-first workflow.

## License

MIT
