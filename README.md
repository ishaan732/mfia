# LensLog

LensLog is a free photographer community app for sharing photos, locations, and camera settings like ISO, aperture, shutter speed, camera, and lens.

## Run Locally

```sh
npm start
```

Open `http://localhost:3000`.

## Deploy On Render

This repo is ready to replace the existing Render web service.

Render settings:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`
- Instance type: Free is fine for the prototype

If the existing Render service is connected to this GitHub repo, commit and push these files. Render should redeploy automatically.

## Always Online

Render Free web services can spin down after 15 minutes without inbound traffic. This repo includes a GitHub Actions workflow at `.github/workflows/keep-render-awake.yml` that pings `https://lenslog.onrender.com/api/health` every 10 minutes.

For true guaranteed always-on hosting, move the Render service from Free to a paid instance type. The scheduled ping is a free-tier workaround and uses GitHub Actions plus Render free instance hours.

## Shared Photo Submissions

LensLog now has backend endpoints for real shared submissions:

- `GET /api/posts` returns the shared feed.
- `POST /api/posts` publishes a photo and settings.
- Uploaded images are saved under the server data directory and served from `/uploads/...`.

For a public Instagram launch, configure persistent storage before collecting real submissions. Render Free files are not permanent across restarts/redeploys. Use one of these before launch:

- Render paid instance with a persistent disk and `DATA_DIR` pointed at that disk.
- External storage such as Cloudinary, S3, Firebase Storage, or Supabase Storage.
- A hosted database for post metadata if you want moderation, search, deletion, and admin review.

## Google Readiness

Included:

- SEO tags and structured data
- `robots.txt`
- PWA manifest
- SVG app icon
- service worker for HTTP/HTTPS deployments
- Firebase Hosting config if you later deploy with Google Firebase

Real Google Sign-In needs a Google OAuth client ID. The current account flow is a Gmail-ready local profile that can be upgraded to real OAuth.
