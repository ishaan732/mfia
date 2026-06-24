# LensLog

LensLog is a free photographer community app for sharing photos, locations, and camera settings like ISO, aperture, shutter speed, camera, and lens.

## Run Locally

```sh
npm start
```

Open `http://localhost:3000`.

Run backend checks:

```sh
npm test
```

## Deploy On Render

This repo is ready to replace the existing Render web service.

Render settings:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`
- Instance type: Free is fine for testing; use paid always-on hosting before a serious public push.
- Environment variables:
  - `DATA_DIR`: set this to a persistent disk mount path before public launch.
  - `ADMIN_TOKEN`: set a long private owner pass. Use it at `/admin.html` to create admin passes.
  - `OWNER_CODE`: optional owner code. Default: `ishaan`.
  - `AUTO_HIDE_REPORT_COUNT`: optional number of unique reports before a post is hidden automatically. Default: `5`.

If the existing Render service is connected to this GitHub repo, commit and push these files. Render should redeploy automatically.

## Always Online

Render Free web services can spin down after 15 minutes without inbound traffic. This repo includes a GitHub Actions workflow at `.github/workflows/keep-render-awake.yml` that pings `https://lenslog.onrender.com/api/health` every 10 minutes.

For true guaranteed always-on hosting, move the Render service from Free to a paid instance type. The scheduled ping is a free-tier workaround and uses GitHub Actions plus Render free instance hours.

## Shared Photo Submissions

LensLog now has backend endpoints for real shared submissions:

- `GET /api/posts` returns the shared feed.
- `POST /api/posts` publishes a photo and settings.
- `POST /api/reports` marks a public photo for review.
- `GET /api/admin/posts` lists all posts when `ADMIN_TOKEN` is provided.
- `PATCH /api/admin/posts/:id` hides/unhides a post when `ADMIN_TOKEN` is provided.
- `DELETE /api/admin/posts/:id` removes a post when `ADMIN_TOKEN` is provided.
- `/admin.html` provides a private admin dashboard for post moderation and admin passes.
- `POST /api/admin/session` verifies an owner/admin pass.
- `GET /api/admin/passes` lists admin passes for the Owner only.
- `POST /api/admin/passes` creates a new one-time visible admin pass for the Owner only.
- `DELETE /api/admin/passes/:id` revokes an admin pass for the Owner only.
- Uploaded images are saved under the server data directory and served from `/uploads/...`.
- Server writes are serialized so simultaneous submissions do not overwrite each other.
- Uploaded image bytes are checked as real PNG, JPG, or WebP files.

For a public Instagram launch, configure persistent storage before collecting real submissions. Render Free files are not permanent across restarts/redeploys. Use one of these before launch:

- Render paid instance with a persistent disk and `DATA_DIR` pointed at that disk.
- External storage such as Cloudinary, S3, Firebase Storage, or Supabase Storage.
- A hosted database for post metadata if you want moderation, search, deletion, and admin review.

## Google Readiness

Included:

- SEO tags and structured data
- `robots.txt`
- `sitemap.xml`
- Privacy and terms pages
- PWA manifest
- SVG app icon
- service worker for HTTP/HTTPS deployments

Real Google Sign-In needs a Google OAuth client ID. The current account flow is a Gmail-ready local profile that can be upgraded to real OAuth.

## Admin Passes

Go to `https://lenslog.onrender.com/admin.html` and unlock with the owner code `ishaan`. The private Render `ADMIN_TOKEN` also works as a backup owner pass.

Roles:

- Owner: you. Can moderate photos and give or revoke admin passes.
- Admin: can moderate photos like the owner, but cannot give or revoke passes.
- Normal visitors: can use the normal site, add photos, write text/settings, and manage their own browser profile. They do not enter the admin dashboard.

Admin pass codes are shown once when created. They are numbered from `ADMIN-001-...` to `ADMIN-100-...`. Send each person only their own pass. Revoke a pass from the same admin page when someone should no longer have access.
