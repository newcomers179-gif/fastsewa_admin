# FastSewa Admin Dashboard

Staff panel for fastsewa.com — a separate static site (no build step) that talks to the main backend's
`/api/admin/*` endpoints.

| File | Purpose |
|---|---|
| `index.html` + `login.js` | admin login |
| `dashboard.html` + `admin.js` | dashboard: stats, bookings (details, documents, status), payments, enquiries, pricing, users, admins |
| `admindashboard.css` | styles |
| `config.js` | `API_BASE` — backend URL ending in `/api` (generated from env in Docker/Render) |
| `Dockerfile`, `docker/` | nginx image with security headers + CSP; writes `config.js` from `API_BASE` at start |

## Local development

`npm start` in `backend/` serves this dashboard on http://localhost:8081 automatically, already pointed at the
local API. Standalone: any static server works (`npm run dev`, `python3 -m http.server 8081`) — edit
`config.js` first.

## Security model

- Access is enforced by the backend: every `/api/admin/*` route requires a valid token of a user with
  `userType: "admin"`. The page re-checks the session with `/api/auth/me` on load and returns to the login page
  on any 401.
- All data from the API is HTML-escaped before rendering, and there are no inline scripts or event handlers, so
  the Docker image can send a strict `Content-Security-Policy` (`script-src 'self'`).
- Admin accounts can't be deleted from the panel (remove them directly in the database).

See [DEPLOYMENT.md](DEPLOYMENT.md) to deploy.
