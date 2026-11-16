import { toast } from "sonner";
import i18n from "../i18n";

// Matches the backend multer limit for purchase images (payment receipt and
// required-field images). Checking here avoids uploading a file the server will
// reject and shows a clear message instead of a generic error.
export const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;

/** Returns "notImage" | "empty" | "tooLarge" for an unusable file, else null. */
export function getImageFileError(file) {
    if (!file) return null;
    if (!file.type || !file.type.startsWith("image/")) return "notImage";
    if (file.size === 0) return "empty";
    if (file.size > MAX_UPLOAD_IMAGE_BYTES) return "tooLarge";
    return null;
}

/**
 * Shrinks a photo in the browser before upload: scales it down to maxWidth and
 * re-encodes it as WebP (JPEG where WebP is not supported). Returns the
 * original file when it can't be decoded, is a GIF/SVG, or would not get
 * smaller, so the upload never fails because of this step.
 */
export async function shrinkImage(file, { maxWidth = 1600, quality = 0.8 } = {}) {
    if (!file?.type?.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
    try {
        // from-image applies the phone's EXIF rotation, so the photo isn't sideways.
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        const scale = Math.min(1, maxWidth / bitmap.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext("2d");
        // White behind transparent PNGs, which would turn black as JPEG.
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();

        const encode = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
        let blob = await encode("image/webp");
        if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg");
        if (!blob || blob.size >= file.size) return file;

        const ext = blob.type === "image/webp" ? ".webp" : ".jpg";
        const name = (file.name || "photo").replace(/\.[^.]+$/, "") + ext;
        return new File([blob], name, { type: blob.type });
    } catch {
        return file;
    }
}

/**
 * Validates a picked image. Shows a toast and returns false when it can't be
 * uploaded; returns true when it is fine.
 */
export function checkImageFile(file) {
    const error = getImageFileError(file);
    if (!error) return true;
    toast.error(i18n.t(`checkout:imageUpload.${error}`));
    return false;
}
