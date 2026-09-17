// ============================================
// STORAGE KEY DERIVATION
// ============================================
// The R2 object key mirrors each file's path relative to the local `uploads/`
// root. Because existing DB references already hold that relative path
// (images.url = "/uploads/images/x.jpg", e_booklet_file_assets.storage_key =
// "e-booklets/private/x.pdf"), every row already contains its key and no data
// migration is needed. `rclone sync uploads/ -> bucket` reproduces this layout.

/**
 * Turns a stored reference into its R2 object key.
 *   "/uploads/images/x.jpg"        -> "images/x.jpg"
 *   "uploads/samples/y.pdf"        -> "samples/y.pdf"
 *   "e-booklets/private/z.pdf"     -> "e-booklets/private/z.pdf" (unchanged)
 */
export function normalizeStorageKey(reference: string): string {
  let key = reference.trim();
  if (key.startsWith("/")) key = key.slice(1);
  if (key.startsWith("uploads/")) key = key.slice("uploads/".length);
  return key;
}

/**
 * True when the reference is an absolute external URL (e.g. a Firebase/Google
 * profile photo). Those are served as-is and never touched by the migration.
 */
export function isExternalUrl(reference: string): boolean {
  return /^https?:\/\//i.test(reference.trim());
}
