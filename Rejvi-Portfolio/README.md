# Rejvi Portfolio Studio — Version 2

A white, responsive multipage portfolio with a complete owner back office, a public article journal, moderated comments, owner replies, and reactions. Built for Samiur Rahaman Rejvi with Node.js 24+, vanilla HTML/CSS/JavaScript, and persistent SQLite. Bundled Noto Sans Bengali fonts render Bengali offline (OFL license included). No npm dependencies, external database account, API key, or frontend build step is required.

**Already running Version 1? Read `UPGRADE-BANGLA.md` first.** Preserve your existing `data` directory. Do not replace it with an empty directory or run owner setup unnecessarily.

## Run locally

Install Node.js 24 or newer from https://nodejs.org, extract this ZIP, and open a terminal inside `Rejvi-Portfolio`.

First installation only:

```sh
npm run setup
```

Enter your administrator email, a password of 12–200 characters, and confirmation. Password characters are hidden. No default password is supplied.

Start the website:

```sh
npm start
```

Keep the terminal open, then visit:
- Portfolio: http://localhost:3000
- Back office: http://localhost:3000/admin

Use the exact `localhost` hostname. `127.0.0.1` is a different origin for form security. `npm start` loads `.env` if present. Without a custom `.env`, `node server.mjs` also works. No `npm install` is needed for local use.

Windows: from File Explorer’s project-folder address bar, type `cmd` and press Enter. The optional `.bat` files can be blocked by Windows Smart App Control; use the terminal commands instead, keeping Windows Security enabled. Do not open `index.html` directly: admin, articles, and forms require the server.

## Public website

- Home, About, Work, Résumé, Articles, Contact, Privacy, individual project and article pages.
- Custom pages with their own URLs, headings, covers and Markdown content.
- White background, five accent choices, three heading-font styles, rounded/squared corners.
- Page slide transitions, scroll reveals, animated tagline, hover states, reduced-motion support.
- Touch swiping on the **bottom page-navigation strip**; normal article scrolling is not intercepted.
- Search/category filters for projects and articles.
- Project case studies: overview, tools, challenge, approach, outcome, cover, gallery, repository/live links.
- Optional education, experience, services, awards, certifications, research, volunteering, interests, testimonials, FAQ and résumé download.
- Articles support Bengali and English, headings, bold, emphasis, lists, quotes and code blocks. Raw HTML is escaped, not executed. This is a deliberately limited Markdown editor; HTML embeds, arbitrary scripts and full Markdown link/image syntax are not supported. Use the article cover for images.
- Likes, insightful and love reactions. One selected reaction per article per browser cookie; readers can change or remove it.
- Comments require a name, email and message. New comments stay pending until approved. Email addresses are visible only to the owner and are self-reported, not verified.
- Admin replies appear under approved comments. Replies do **not** send automatic emails.

Empty optional collections are hidden. No fictitious credentials, employers, testimonials, completed paid work, or published articles are seeded. Add your real content before launch.

## Portfolio Studio

| Section | What it controls |
|---|---|
| Overview | Published projects/articles, pending comments, unread inbox, setup checklist |
| Profile | Name, introduction, biography, animated text, contact links, portrait, résumé |
| Collections | Create/edit/remove/duplicate/reorder projects, skills, education and other portfolio records |
| Articles | Write/preview, draft/publish, category, tags, excerpt, cover, per-article comments |
| Comments | Approve, hide, keep pending, remove, and write public replies |
| Inbox | Read/archive/delete messages; open your email application to reply |
| Media | Upload PNG/JPEG/WebP/PDF, choose existing media, copy asset URLs |
| Pages | Navigation order/labels, visibility, custom pages, headings and introductions |
| Home layout | Reorder and hide home sections |
| Appearance | Brand, logo/favicon, colors, typography, corners, motion, forms, social links, SEO defaults |
| Website text | Main public headings, button labels, notices and form messages |
| Settings | Password/email changes, JSON export, last 20 website-content revisions |

Save **website content** with `Save website`; save each **article** using `Save article`. Comment moderation and inbox actions save immediately. Ctrl+S / Cmd+S saves the active website/article editor. Uploads save immediately but need a saved content reference to appear on a page.

Concurrent edits to website content or articles are rejected rather than silently overwriting a newer version. Copy your unsaved edits somewhere safe, reload and reconcile them if a conflict occurs.

This is a structured CMS: content, built-in page headings, home order, menus, media and provided appearance choices are editable. New kinds of widgets, arbitrary layout engines, custom code, authentication rules and server behavior require source changes. Built-in page URLs stay fixed; custom page slugs are editable. Admin utility labels are not public-site content.

## Existing data and backups

The server automatically creates or upgrades `data/portfolio.sqlite` and uses `data/uploads/`. Version 2 adds tables without deleting Version 1 content, login, messages or uploads. Read `UPGRADE-BANGLA.md` for the copy-and-upgrade workflow.

For a complete restorable backup:
1. Stop the server.
2. Copy the entire `data` directory to a secure location.
3. Restart the server.

If `DATA_DIR` is configured, back up that directory instead. Restore by stopping the server and replacing the complete data directory with the backup. Protect it: it contains visitor contact details and password hashes.

Settings → Export includes website content, articles, comments, messages and reactions as JSON. It excludes file bytes and owner credentials and is **not** a one-click database restore. Website history loads an earlier content revision into the editor for review and saving; it does not roll back articles or uploaded files.

Changing or removing an asset reference does not delete the stored file. Media files are retained to avoid breaking older links and backups. Clean unreferenced files manually only after a backup.

Forgot the administrator password? Run `npm run setup` on the server. It resets the single administrator account and revokes sessions without deleting portfolio data.

## Deployment

This distribution has not been publicly deployed. It needs a Node/Docker host, **HTTPS**, a **persistent disk/volume**, and **one application instance** for this SQLite architecture. Static-only hosting such as GitHub Pages cannot run the backend.

### Node hosting / Render

1. Put the source in your own Git repository, excluding `.env` and `data/`.
2. Use Node 24+. Build command: `npm install --omit=dev`. Start command: `npm start`.
3. Attach a persistent disk, for example mounted at `/var/data`, and set `DATA_DIR=/var/data/rejvi`.
4. Set `NODE_ENV=production` and `APP_ORIGIN=https://your-exact-domain`. The server normalizes whitespace/trailing slashes; multiple allowed origins can be comma-separated. Let the host supply `PORT`.
5. Deploy. In the host’s running-service shell, run `npm run setup`, or securely transfer your backed-up existing data to the persistent directory. Do not create the owner during a build step that cannot access the persistent disk.
6. Use `/admin`, personalize content and test contact/comments/reactions on the deployed domain.
7. If switching to a custom domain, update APP_ORIGIN, restart, and redirect alternate domains to the canonical domain.

Render filesystem changes require a persistent disk to survive restarts/redeploys. Choose a service plan that supports one. An ephemeral free service is not durable storage for this application.

### Docker / VPS

Create `.env` with your real HTTPS domain:

```env
APP_ORIGIN=https://portfolio.example.com
```

Then:

```sh
docker compose up -d --build
docker compose exec portfolio node scripts/setup.mjs
```

Configure your TLS reverse proxy to forward the domain to `127.0.0.1:3000`. Compose binds to loopback and stores `/app/data` in a named persistent volume. `docker compose down -v` deletes that volume: do not use it unless data deletion is intended. Docker deployment is supplied as configuration, not verified on your server.

Only enable `TRUST_PROXY=1` behind a trusted reverse proxy that overwrites X-Forwarded-For. Otherwise keep it disabled. Without a trusted forwarded address, rate limits use the direct connection’s address, which can group visitors behind a proxy.

## Configuration

Copy `.env.example` to `.env` when needed.

| Variable | Default | Purpose |
|---|---|---|
| PORT | 3000 | HTTP port |
| HOST | 0.0.0.0 | Bind interface; use 127.0.0.1 for local-only access |
| APP_ORIGIN | http://localhost:3000 | Exact canonical browser origin |
| NODE_ENV | development | Set production for Secure cookies and HTTPS enforcement |
| DATA_DIR | ./data | Persistent SQLite and upload directory |
| TRUST_PROXY | 0 | Only trust forwarded IPs behind your controlled proxy |

## Verification

```sh
npm test
```

Tests use temporary databases and ports 3187/3188. They cover authentication, CSRF/origin checks, persistence, drafts, unsafe-link rejection, inbox, uploads, export, password session revocation, article publishing, comment moderation/reply and email privacy, reaction changes/removal, hidden pages, custom page routes, save conflicts, content history and Version 1 migration. See `VERIFICATION.md` for actual browser QA results.

## Operating limits

- One owner account. No public registration, staff roles or email password reset.
- Contact and comment notifications are not sent by email. Inbox replies use your email app; article replies are public on the article page.
- Reactions identify a browser cookie, not a verified person. Clearing cookies or using another browser can permit another reaction. They are lightweight feedback, not trustworthy voting or analytics.
- No analytics tracking or invented visitor counters.
- Public uploads only: PNG/JPEG/WebP/PDF, maximum 2 MB. External media URLs must use HTTPS.
- Sessions expire after 8 hours. Login limits: 10 attempts/IP/15 minutes. Contact: 5/IP/hour. Comments: 6/IP/hour. Reactions: 60/IP/hour.
- Admin inbox shows the latest 1,000 messages; comment moderation shows the latest 2,000. Export includes all records. Article list currently loads all articles; this suits a personal portfolio, not a large publication.
- A JavaScript-enabled browser is required for normal interaction. Article HTML includes a no-JavaScript text fallback and per-article metadata; most other content renders client-side.
- Treat backups and export files as private. DOB and private family details are not published.
- Functional testing is not an independent penetration test. Keep Node and hosting updated and back up regularly.

Runtime/deployment references:
- https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- https://render.com/docs/disks


## Added logo asset
- New stylish logo file added at `public/brand/SR_Rejvi_logo.png`
- Extra copy at project root: `SR_Rejvi_logo.png`


## Logo integration update
- Header now uses the `SR_Rejvi` logo by default.
- Site loader now shows the same logo.
- Website and admin favicon now point to `/public/brand/SR_Rejvi_logo.png`.


## Complete SR_Rejvi branding
- Header uses the SR_Rejvi wordmark with a safe fallback even when older saved site data has no logo value.
- Footer now uses the SR_Rejvi wordmark.
- Loader and favicon use the SR_Rejvi asset.
- Admin login and sidebar use coordinated SR_Rejvi branding.
