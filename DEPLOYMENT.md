# Admin Dashboard — Deployment

The dashboard only needs one setting: **`API_BASE`**, the backend URL ending in `/api`
(e.g. `https://fastsewa.com/api`). Also add the dashboard's own origin to the backend's `CORS_ORIGINS`.

## Option A — Docker (nginx, recommended)

```bash
docker build -t fastsewa-admin .
docker run -d -p 8081:8080 -e API_BASE=https://fastsewa.com/api fastsewa-admin
```

- `PORT` (default `8080`) is honoured, so Render/Railway/Fly can set it.
- At start-up `config.js` is regenerated from `API_BASE`, and the API origin is added to the CSP `connect-src`.
- `GET /healthz` returns `ok` for health checks.
- HTML/JS/CSS are served with `Cache-Control: no-cache` so a new deploy reaches browsers immediately
  (the old config cached JS for a year with `immutable`, so fixes never reached admins).

## Option B — Static host (Render Static Site, Netlify, Vercel, Cloudflare Pages)

Publish this folder. Either edit `config.js` by hand, or use a build command that writes it from an
environment variable (this is what `render.yaml` does):

```bash
node -e "const u=(process.env.API_BASE||'').replace(/\/+$/,'');if(!/^https?:\/\//.test(u)){console.error('Set API_BASE');process.exit(1)}require('fs').writeFileSync('config.js','const API_BASE = '+JSON.stringify(u)+';\n')"
```

Add these response headers on the host if it supports them: `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and the CSP from `docker/default.conf.template`.

## Restricting access (recommended)

The panel relies on admin login only. For an extra layer put it on a separate, unlinked subdomain
(e.g. `admin.fastsewa.com`) behind Cloudflare Access or basic auth.
