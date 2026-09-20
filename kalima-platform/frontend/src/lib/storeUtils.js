/**
 * Shared utility helpers for the store/market feature.
 */

/**
 * Formats a numeric price to 2 decimal places.
 * @param {number|string} amount
 * @returns {string}
 */
export function formatPrice(amount) {
  if (amount === null || amount === undefined) return "0.00";
  const num = parseFloat(amount);
  if (isNaN(num)) return "0.00";
  return num.toFixed(2);
}

/**
 * Calculates discount percentage from original and discounted prices.
 * @param {number|string} mainPrice
 * @param {number|string} priceAfterDiscount
 * @param {number} precision number of decimal places in the result
 * @returns {number}
 */
export function calculateDiscountPercentage(mainPrice, priceAfterDiscount, precision = 2) {
  const original = Number.parseFloat(mainPrice);
  const discounted = Number.parseFloat(priceAfterDiscount);

  if (Number.isNaN(original) || Number.isNaN(discounted) || original <= 0) return 0;

  const raw = ((original - discounted) / original) * 100;
  const bounded = Math.max(0, Math.min(100, raw));

  return Number(bounded.toFixed(precision));
}

/**
 * Builds the absolute URL for an uploaded file using the API base URL.
 * @param {string|null} path
 * @returns {string|null}
 */
export function getImageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  // On the dev environment, resolve uploads against the dev origin so files
  // uploaded on dev (which live in dev's storage) are fetched from dev, not
  // production. Mirrors the dev detection in src/api/axios.js.
  const baseURL = window.location.hostname.includes("dev")
    ? "https://dev.kalima-edu.com/api/v2"
    : import.meta.env.VITE_API_URL || "/api/v2";
  // Remove the trailing /api/vX to get the root domain
  const rootURL = baseURL.replace(/\/api\/v\d+$/, "");

  return `${rootURL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Returns the API base URL (including /api/vX), dev-aware. Use when building a
 * direct URL to an API-served file endpoint (e.g. sample preview/download) that
 * must resolve to the current environment's origin, not the baked production
 * VITE_API_URL. Mirrors the dev detection in src/api/axios.js.
 * @returns {string}
 */
export function getApiUrl() {
  return window.location.hostname.includes("dev")
    ? "https://dev.kalima-edu.com/api/v2"
    : import.meta.env.VITE_API_URL || "/api/v2";
}

/**
 * Returns the base API URL without trailing paths
 * @returns {string}
 */
export function getBaseUrl() {
  const raw = window.location.hostname.includes("dev")
    ? "https://dev.kalima-edu.com/api/v2"
    : import.meta.env.VITE_API_URL || "/api/v2";
  try {
    return new URL(raw).origin;
  } catch {
    try {
      return new URL(raw, globalThis.location.origin).origin;
    } catch {
      return globalThis.location.origin;
    }
  }
}


/**
 * Builds the images object expected by ImageGallery from API data.
 * @param {object} product  - raw product from GET /products/:id
 * @param {Array}  gallery  - raw gallery from GET /products/:id/gallery
 * @returns {{ main: string|null, thumbnails: string[] }}
 */
export function buildProductImages(product, gallery = []) {
  const main = getImageUrl(product?.thumbnail_image?.url) ?? null;
  const thumbnails = gallery
    .map((item) =>
      getImageUrl(item?.url ?? item?.image_url ?? item?.images?.url ?? item),
    )
    .filter((url) => typeof url === "string" && url.length > 0);
  return { main, thumbnails };
}

/**
 * Builds a unified media array (images + videos) for advanced galleries.
 * @param {object} product
 * @returns {{ main: object|null, thumbnails: object[] }}
 */
export function buildProductMedia(product) {
  const mainImage = getImageUrl(product?.thumbnail_image?.url);
  const main = mainImage ? { type: 'image', url: mainImage, isMain: true } : null;

  const galleryImages = (product?.product_gallery || []).map(g => ({
    type: 'image',
    url: getImageUrl(g?.images?.url),
    sort_order: g.sort_order || 0
  })).filter(g => g.url);

  const galleryVideos = (product?.product_gallery_videos || []).map(v => {
    const isYoutube = v.url?.includes('youtube.com') || v.url?.includes('youtu.be');
    let thumbnail = null;
    if (isYoutube) {
      try {
        let videoId = '';
        if (v.url.includes('youtube.com/watch')) {
          videoId = new URL(v.url).searchParams.get('v');
        } else if (v.url.includes('youtu.be/')) {
          videoId = v.url.split('youtu.be/')[1].split(/[?#]/)[0];
        }
        if (videoId) thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      } catch (e) { }
    }
    return {
      type: 'video',
      url: getImageUrl(v.url),
      thumbnail,
      source_type: v.source_type,
      sort_order: v.sort_order || 0
    };
  }).filter(v => v.url);

  const thumbnails = [...galleryImages, ...galleryVideos].sort((a, b) => a.sort_order - b.sort_order);
  return { main, thumbnails };
}

/**
 * Calculates the checkout subtotal. Prioritizes backend preview subtotal,
 * otherwise falls back to calculating it manually from the mapped items array.
 * @param {object|null} preview
 * @param {Array} items
 * @returns {number}
 */
export function calculateCheckoutSubtotal(preview, items) {
  if (preview?.subtotal) return parseFloat(preview.subtotal);
  if (preview?.purchase?.subtotal) return parseFloat(preview.purchase.subtotal);

  return items.reduce(
    (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
    0,
  );
}

/**
 * Formats and groups cart items for checkout display, merging identical products.
 * @param {Array} cartItems
 * @returns {Array}
 */
export function formatCheckoutItems(cartItems = []) {
  const grouped = cartItems.reduce((acc, item) => {
    const product = item.products ?? {};
    const id = product.id ?? item.id ?? Math.random();

    if (acc[id]) {
      acc[id].quantity += 1;
      return acc;
    }

    const imageSource =
      product.images?.[0]?.url ?? product.thumbnail_image?.url ?? item.image;

    acc[id] = {
      id,
      name: product.title ?? item.name ?? "",
      price: parseFloat(
        item.price_at_purchase ?? product.price ?? item.price ?? 0,
      ),
      image: getImageUrl(imageSource),
      type: product.type ?? item.type ?? "",
      quantity: item.quantity ?? 1,
    };

    return acc;
  }, {});

  return Object.values(grouped);
}

/**
 * Valid order statuses for filters and general usage
 */
export const ORDER_STATUSES = ['pending', 'received', 'confirmed', 'delivered', 'returned'];

/**
 * Formats amount into EGP currency string
 * @param {number|string} amount 
 * @param {string} t translation function (optional)
 * @returns {string}
 */
export function formatCurrency(amount, t) {
  const num = parseFloat(amount);
  const currencySymbol = t ? t('common.currencyEGP', 'EGP') : 'EGP';
  if (isNaN(num)) return `${currencySymbol} 0.00`;
  return `${currencySymbol} ${num.toFixed(2)}`;
}

/**
 * Localized date formatting for orders
 * @param {string} dateString 
 * @param {string} lang e.g. 'ar' or 'en'
 * @returns {string}
 */
export function formatOrderDate(dateString, lang = 'en') {
  if (!dateString) return "";
  const date = new Date(dateString);
  let locale = lang;
  if (lang === 'ar') locale = 'ar-EG';
  return date.toLocaleDateString(locale, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Returns Tailwind color classes based on order status
 * @param {string} status 
 * @returns {string}
 */
export function getStatusColor(status) {
  switch (status?.toLowerCase()) {
    case 'pending': return 'bg-highlight/10 text-highlight hover:bg-highlight/30 border-highlight/50';
    case 'received': return 'bg-primary/20 text-primary hover:bg-primary/30 border-primary/50';
    case 'confirmed': return 'bg-success/20 text-success hover:bg-success/30 border-success/50';
    case 'delivered': return 'bg-success/20 text-success hover:bg-success/30 border-success/50';
    case 'returned': return 'bg-destructive/20 text-destructive hover:bg-destructive/30 border-destructive/50';
    default: return 'bg-muted/20 text-muted-foreground border-muted';
  }
}

/**
 * Formats a byte count into a human-readable file size string.
 * @param {number} bytes
 * @returns {string}
 */
/**
 * Formats a byte count into a human-readable size string.
 * @param {number|string} bytes - size in bytes
 * @returns {string} - formatted size string
 */
export function formatFileSize(bytes) {
  const num = Number(bytes);
  if (!num || num === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  return `${(num / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Attempts to fetch a remote file's size via a HEAD request.
 * @param {string} url - relative or absolute file URL
 * @returns {Promise<number|null>} - size in bytes or null if failed
 */
export async function getFileSizeFromUrl(url) {
  if (!url) return null;
  try {
    const baseURL = window.location.hostname.includes("dev")
      ? "https://dev.kalima-edu.com/api/v2"
      : import.meta.env.VITE_API_URL || "/api/v2";
    // Strips /api/v2 or /api/v1 (with or without trailing slash) to get the site root
    const rootURL = baseURL.replace(/\/api\/v\d+\/?$/, "");

    let fullUrl = url;
    if (!url.startsWith('http')) {
      fullUrl = `${rootURL}${url.startsWith('/') ? '' : '/'}${url}`;
    }

    // Use a small timeout or abort controller to prevent long-hanging fetches
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(fullUrl, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-cache'
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const cl = response.headers.get('content-length');
    return cl ? Number(cl) : null;
  } catch (e) {
    // Silent failure for network/CORS errors as they are expected for some external URLs
    // Only log in development if it's not an AbortError or TypeError (CORS)
    if (import.meta.env.DEV && e.name !== 'AbortError' && e.name !== 'TypeError') {
      console.warn('Silent failure getting remote file size for:', url, e.message);
    }
    return null;
  }
}

/**
 * Removes the Egyptian international prefix (+2 or +20) for display.
 * @param {string} phone
 * @returns {string}
 */
export function formatPhone(phone) {
  if (!phone) return "";
  const cleaned = String(phone).trim();
  // If it starts with +2 (optionally space) 0... or just +2 (optionally space)...
  // We want to turn +20 or +2 0 into 0, and +2 into ""
  if (/^\+2[ ]?0/.test(cleaned)) {
    return "0" + cleaned.replace(/^\+2[ ]?0/, "");
  }
  return cleaned.replace(/^\+2[ ]?/, "");
}

/**
 * Formats a time interval in milliseconds to a human-readable string.
 * @param {number|string} ms - milliseconds until release
 * @param {function} t - translation function (optional)
 * @returns {string} - e.g. "2d 5h", "10h 30m", "45m 12s", or "12s"
 */
export function formatTimeUntilRelease(ms, t) {
  const diff = Number(ms);

  const d = t ? t("countdown.days", "d") : "d";
  const h = t ? t("countdown.hours", "h") : "h";
  const m = t ? t("countdown.minutes", "m") : "m";
  const s = t ? t("countdown.seconds", "s") : "s";

  if (isNaN(diff) || diff <= 0) return `0${s}`;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  if (days > 0) return `${days}${d} ${hours}${h}`;
  if (hours > 0) return `${hours}${h} ${minutes}${m}`;
  if (minutes > 0) return `${minutes}${m} ${seconds}${s}`;
  return `${seconds}${s}`;
}
