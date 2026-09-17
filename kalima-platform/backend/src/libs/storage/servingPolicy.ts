// ============================================
// SERVING POLICY
// ============================================
// Per-asset decision of HOW a file reaches the user:
//   - "signed": backend checks access, then hands the browser a short-lived
//     presigned R2 link. Offloads bandwidth from the server.
//   - "proxy": the file streams through the backend (session-protected, no
//     shareable direct link). Used for sensitive / paid content.
//
// This table is the single source of truth for the classification agreed with
// the client. To move a category between signed and proxy later, change one
// line here and redeploy — no file movement, no DB change.

export type ServeMode = "signed" | "proxy";

export interface ServePolicy {
  mode: ServeMode;
  /** TTL for signed links, in seconds. Ignored when mode is "proxy". */
  ttlSeconds: number;
}

export type AssetCategory =
  // Public — signed
  | "product_image"
  | "product_thumbnail"
  | "payment_method_image"
  | "sample_thumbnail"
  | "sample_low_quality"
  | "ebooklet_cover"
  | "profile_pic"
  // Signed by client choice, kept short because sensitive
  | "payment_screenshot"
  | "purchase_watermark"
  | "ebooklet_page_image"
  // Private — proxy
  | "sample_high_quality"
  | "ebooklet_hotspot_media"
  | "ebooklet_document"
  | "admin_access_code_pdf";

const MINUTE = 60;

export const SERVING_POLICY: Record<AssetCategory, ServePolicy> = {
  // ---- Public (signed) ----
  product_image: { mode: "signed", ttlSeconds: 15 * MINUTE },
  product_thumbnail: { mode: "signed", ttlSeconds: 30 * MINUTE },
  payment_method_image: { mode: "signed", ttlSeconds: 60 * MINUTE },
  sample_thumbnail: { mode: "signed", ttlSeconds: 30 * MINUTE },
  sample_low_quality: { mode: "signed", ttlSeconds: 30 * MINUTE },
  ebooklet_cover: { mode: "signed", ttlSeconds: 60 * MINUTE },
  profile_pic: { mode: "signed", ttlSeconds: 60 * MINUTE },

  // ---- Signed by client choice — short TTL because these carry sensitive
  //      data (payment proof) or paid content (booklet pages) ----
  payment_screenshot: { mode: "signed", ttlSeconds: 5 * MINUTE },
  purchase_watermark: { mode: "signed", ttlSeconds: 15 * MINUTE },
  ebooklet_page_image: { mode: "signed", ttlSeconds: 10 * MINUTE },

  // ---- Private (proxy) ----
  sample_high_quality: { mode: "proxy", ttlSeconds: 0 },
  ebooklet_hotspot_media: { mode: "proxy", ttlSeconds: 0 },
  ebooklet_document: { mode: "proxy", ttlSeconds: 0 },
  admin_access_code_pdf: { mode: "proxy", ttlSeconds: 0 },
};

// The serve MODE (signed vs proxy) is a security decision and stays in code —
// change it here and redeploy. The signed-link TTL, however, can be tuned per
// category from the server environment WITHOUT a redeploy, by setting
//   R2_SIGNED_TTL_<CATEGORY>=<seconds>
// e.g. R2_SIGNED_TTL_EBOOKLET_PAGE_IMAGE=600. Missing/invalid values fall back
// to the code default above. Proxy categories have no TTL and ignore overrides.

function ttlEnvVarName(category: AssetCategory): string {
  return `R2_SIGNED_TTL_${category.toUpperCase()}`;
}

export function getServePolicy(category: AssetCategory): ServePolicy {
  const base = SERVING_POLICY[category];
  if (base.mode !== "signed") return base;

  const raw = process.env[ttlEnvVarName(category)];
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return { mode: base.mode, ttlSeconds: parsed };
    }
  }
  return base;
}
