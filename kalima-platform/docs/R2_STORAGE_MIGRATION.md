# R2 Storage Migration (Kalima)

This document explains how file storage works after the migration from local
server disk to **Cloudflare R2** (S3-compatible object storage), and how to
operate, extend, test, and roll it back. It is the reference for anyone
continuing this work.

Branch: `r2-storage-migration`. Keep this doc updated as each step lands.

---

## 1. Why

The server disk filled up (~92%, ~73 GB of it was uploaded files). If it fills
completely the site can go down and the database can be corrupted. The fix is to
store uploaded files on Cloudflare R2 instead of the local disk, so the disk
never fills and the system can grow.

R2 was chosen because storage is cheap (~$1/mo for the current size), **egress
is free** (no per-download cost), and it's on Cloudflare's global network.

Fekra is a **separate, later** project (its main content is already on
Cloudinary; it waits on getting that account).

---

## 2. The feature flag

Everything is gated by one environment variable so the new code ships without
changing behaviour until we flip it:

```
STORAGE_BACKEND = local | r2      # default: local
```

- `local` (default): exact original behaviour — files are read/written on disk.
- `r2`: files are stored on and served from R2.

Code reads this via `isR2Enabled()` (`src/libs/storage/config.ts`). Every changed
code path has an `if (isR2Enabled()) { …R2… } else { …disk… }` fork.

### Environment variables

```
STORAGE_BACKEND=r2
R2_ACCOUNT_ID=<cloudflare account id>          # or set R2_ENDPOINT directly
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # optional; derived from account id
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret>                  # secret — Coolify env only, never in git/screenshots
R2_BUCKET=kalima-files
```

Optional per-category signed-URL TTL overrides (seconds), see §5:

```
R2_SIGNED_TTL_<CATEGORY>=<seconds>     # e.g. R2_SIGNED_TTL_EBOOKLET_PAGE_IMAGE=600
R2_SIGNED_TTL_PUBLIC_ASSET=<seconds>   # TTL for the /uploads signed redirect (default 1800)
```

The bucket has **Public Access disabled**. All access goes through the backend's
keys (signed URLs or streaming proxy).

---

## 3. The storage layer (`src/libs/storage/`)

| File | Responsibility |
|------|----------------|
| `config.ts` | Reads/validates env; `isR2Enabled()`, `getR2Config()` |
| `r2Client.ts` | Singleton S3 client (`region: "auto"`, account endpoint) |
| `keys.ts` | `normalizeStorageKey()`, `isExternalUrl()` — see §4 |
| `servingPolicy.ts` | Per-asset signed-vs-proxy classification + TTLs — see §5 |
| `storageService.ts` | `putObject`, `getSignedDownloadUrl`, `proxyObject`, `getObjectBuffer`, `downloadToTempFile`, `deleteObject`, `objectExists` |
| `index.ts` | Barrel export |

Key functions:

- **`putObject({key, body, contentType, contentLength})`** — upload. `body` can be
  a Buffer or a Readable stream.
- **`getSignedDownloadUrl(key, {expiresIn, contentType?, contentDisposition?})`** —
  presigned GET URL. `contentType`/`contentDisposition` are baked into the signed
  query so they survive on the direct R2 response.
- **`proxyObject(key, req, res, opts?)`** — streams the object through the backend.
  Forwards the client's `Range` header and mirrors R2's `206`/`Content-Range` so
  video seeking works. Does **not** clobber `Content-Type` / `Content-Disposition`
  / `Cache-Control` already set by the caller. Throws `NotFoundError` if missing.
- **`getObjectBuffer(key)`** — read a whole object into a Buffer (small files).
- **`downloadToTempFile(key, ext?)`** — download to a temp file, returns
  `{ path, cleanup }`. For tools that need a real path (pdfinfo, PDF rendering,
  sharp). Caller must call `cleanup()`.

---

## 4. Object keys mirror the old paths → no DB migration

The R2 object key is **the file's path relative to the old `uploads/` root**:

| Stored reference (DB, unchanged) | R2 key |
|----------------------------------|--------|
| `images.url` = `/uploads/images/x.jpg` | `images/x.jpg` |
| `samples.*_url` = `/uploads/samples/x.pdf` | `samples/x.pdf` |
| `e_booklet_file_assets.storage_key` = `e-booklets/private/x.pdf` | `e-booklets/private/x.pdf` |

Because existing rows already contain this relative path, **no database migration
is needed**, and `rclone sync uploads/ → bucket` reproduces exactly this layout.
`normalizeStorageKey(reference)` does the derivation (strips a leading `/` and an
`uploads/` prefix). `isExternalUrl()` detects absolute URLs (e.g. Firebase profile
photos) that must be left untouched.

DB URL shapes are **unchanged**, so there is **no frontend change** — the API keeps
returning `/uploads/...` and the `/uploads` route decides how to serve it.

---

## 5. Serving policy (signed vs proxy)

Two ways a file reaches the user:

- **signed**: backend checks access, then hands the browser a short-lived
  presigned R2 URL. The download comes straight from R2 → offloads the server.
  The URL is a temporary direct link (extractable, shareable for its TTL).
- **proxy**: the file is streamed through the backend (`proxyObject`). Session-
  protected, no shareable direct link. Used for sensitive / paid content.

The classification lives in **`src/libs/storage/servingPolicy.ts`** — one line per
category. **This is the single source of truth.** To move a category between signed
and proxy: change its line and redeploy. No file movement, no DB change.

Current classification (agreed with the client):

| Category | Mode |
|----------|------|
| product images, thumbnails, payment-method images, sample thumbnails, sample low_quality, covers, profile pics | signed |
| payment screenshots, purchase watermark | signed (short TTL — sensitive) |
| e-booklet page images, sample high_quality, e-booklet hotspot media, full booklet PDF, admin access-code PDF | proxy |

**Control model:** the serve *mode* stays in code (a security decision). The
signed-link *TTL* is tunable per category from the environment without a redeploy
via `R2_SIGNED_TTL_<CATEGORY>` (falls back to the code default). `getServePolicy()`
applies the override.

> Note: covers are served via a **signed** URL (`previewPublicCoverAsset` calls
> `serveEBookletFile(..., { mode: "signed" })`). Booklet **page images stay
> proxy** — they are the core paid content and the heaviest traffic, so every
> fetch goes through the backend access check (and can be rate-limited) rather
> than a shareable direct link. To change either, edit `servingPolicy.ts` and the
> relevant serving call.

---

## 6. Upload flows

All gated by `isR2Enabled()`; the `else` branch is the original disk code.

- **Images** — `image.service.ts` `uploadImage()`: after optional sharp
  compression, `putObject({ key: "images/<file>" })`. Returns `url =
  /uploads/images/<file>`.
- **Samples** — `sample.service.ts` `saveFileToDisk()`: `putObject({ key:
  "samples/<file>" })`. Returns `/uploads/samples/<file>`.
- **E-booklets** — `e-booklet.service.ts` `createFileAsset()`: the file is read
  from the multer temp for metadata first (pdfinfo/pdf-lib), then
  `putObject({ key: storage_key })` from the temp stream or buffer; the temp is
  cleaned up. A failed create deletes the R2 object.
- **Access-code print batches** — `e-booklet-access-code-print.service.ts`: the
  storage adapter reads the teacher template image (`getObjectBuffer`) and writes
  the generated batch PDF (`putObject`) via R2.

---

## 7. Serving flows

- **Public assets (`/uploads`)** — `server.ts` `makeUploadsHandler()`: when R2 is
  on, it 302-redirects to a signed URL (`R2_SIGNED_TTL_PUBLIC_ASSET`, default 30
  min); when off, `express.static`. The two guards are kept: protected samples
  (`isProtectedSampleStaticPath`) and the `e-booklets/private` 403.
- **E-booklet files** — `e-booklet.controller.ts` `serveEBookletFile()`: when R2
  is on, derives the key from the path (`e-booklets/private/…` onward, so nested
  `print-batches/` works) and streams via `proxyObject`; when off, `res.sendFile`.
  Replaces the 13 `res.sendFile` sites. Page buffers (on-the-fly single-page PDFs
  and rendered previews) are still `res.send(buffer)` — in-memory, unchanged.
- **Processing that needs a local file** (pdfinfo, page rendering, single-page
  PDF extraction) uses `resolveAssetLocalFile(asset)` in the service, which
  downloads to a temp file on R2 (and returns the disk path on local).
  `assertAssetServable()` skips the disk `access()` check on R2.

---

## 8. Delete flows

- `image.service.ts` `removeFileFromDisk(url)` and `sample.service.ts`
  `removeStoredFile(url)` → `deleteObject(normalizeStorageKey(url))` on R2. R2
  delete failures are now **logged** (previously fire-and-forget unlinks swallowed
  errors, which against R2 would silently accumulate paid objects).
- E-booklet file assets are not deleted by the app (existing behaviour) — only the
  failed-create cleanup deletes from R2.

---

## 9. Testing

Three scripts under `backend/scripts/` (all read R2 creds from env, never print
the secret):

- **`r2SmokeTest.js`** — connectivity: put → head → signed GET → streamed GET →
  delete. `node scripts/r2SmokeTest.js`
- **`r2DevTest.ts`** — serving primitives in-process against real R2: signed
  redirect, proxy full, **Range (206)**, buffer read, temp download.
  `npx ts-node --transpile-only scripts/r2DevTest.ts`
- **`r2ServiceTest.ts`** — the real image/sample/e-booklet services against R2
  with mock DBs (no local Postgres): upload/serve/delete glue.
  `npx ts-node --transpile-only scripts/r2ServiceTest.ts`

Run (PowerShell), setting the secret in your own shell:

```powershell
cd backend
$env:R2_ACCOUNT_ID="..."; $env:R2_ACCESS_KEY_ID="..."
$env:R2_SECRET_ACCESS_KEY="<secret>"; $env:R2_BUCKET="kalima-files"
npx ts-node --transpile-only scripts/r2ServiceTest.ts
```

Not yet validated locally (do on staging before cutover): the full HTTP request
path through the running server, and real PDF preview generation (needs the
`pdfinfo` binary, present on the Linux server).

---

## 10. Migration runbook (production)

The site stays up throughout except a short maintenance window at cutover.

**Phase 1 — foundation (done).** R2 bucket `kalima-files`, storage layer, tests.

**Phase 2 — wiring (done).** Upload/serve/delete routed through R2 behind the
flag. Nothing active while `STORAGE_BACKEND=local`.

**Phase 3 — migrate & switch:**
1. Add the `R2_*` env vars on Coolify (but **keep `STORAGE_BACKEND=local`** for now).
2. `rclone sync` the live `uploads/` volume → `kalima-files` bucket (site stays up).
   The volume is at
   `/var/lib/docker/volumes/<stack>_uploads/_data` on the server.
3. **Pre-generate all e-booklet page previews while files are still local** (so the
   R2→temp cold path is rare after cutover).
4. Final quick `rclone sync` to catch files uploaded since step 2.
5. Set `STORAGE_BACKEND=r2` on Coolify and redeploy (short maintenance window).
6. Smoke-test in production: upload, view, download, access control, video seeking,
   e-booklet page viewing.
7. After verifying, delete the local `uploads/` files to reclaim ~73 GB.

**Rollback:** set `STORAGE_BACKEND=local` and redeploy. Because the local files are
untouched until step 7, the old path works immediately. (After step 7 the files are
only on R2, so rollback would require syncing them back first.)

---

## 11. How to change things later

- **Move a category signed ↔ proxy:** edit its line in `servingPolicy.ts`, redeploy.
  This is a true switch for **controller-served** assets — samples
  (`sample-section.controller` → `serveSampleFile`) and e-booklets
  (`e-booklet.controller` → `serveEBookletFile`), which read the mode from the
  policy per category. **Exception:** images-table assets (product images,
  payment-method images, payment screenshots, purchase watermark, profile pics)
  are served by the generic `/uploads` route in `server.ts`, which cannot tell
  their category apart from the path, so it signs them **as a group**. To make
  one of those proxy (e.g. an admin-only watermark download), add a dedicated
  controller endpoint for it instead of relying on the policy line.
- **Change a signed TTL without a deploy:** set `R2_SIGNED_TTL_<CATEGORY>` on Coolify
  and restart.
- **Rotate R2 keys:** create a new API token in Cloudflare (Object Read & Write,
  scoped to `kalima-files`), update `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` on
  Coolify, redeploy, then delete the old token.

---

## 12. Status / changelog

- ✅ Phase 1 — storage layer + bucket + smoke test (commit `8502df9b`)
- ✅ Phase 2a — images + samples upload/delete/serve (commit `c5c3048f`)
- ✅ Phase 2b — e-booklets + access-code print batches (commits `f16cfe51`, `f3ddc2da`)
- ✅ Dev validation on real R2: serving primitives + real services (test scripts
  `be63aa0c`)
- ✅ Serving classification finalized: covers switched to **signed**; booklet page
  images kept **proxy** (core paid content, per-request access check)
- ✅ Full serving audit + gap fixes: sample preview/download serving wired to R2
  (`sample-section.controller`); e-booklet page-preview generation now writes the
  webp to R2 (and deletes stale previews / cleans up on error via R2). Serving
  made **policy-driven** at the controllers (samples + e-booklets read the mode
  per category from `servingPolicy.ts`), so flipping those categories is a real
  one-line switch; `/uploads` images remain signed as a group (see §11)
- ⏳ Phase 3 — rclone migration, preview pre-generation, cutover, local cleanup
- ⏳ Frontend: retry-on-expiry for signed image URLs
- ⏳ Fekra: same approach, after its Cloudinary account is available
