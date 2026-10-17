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
 * Validates a picked image. Shows a toast and returns false when it can't be
 * uploaded; returns true when it is fine.
 */
export function checkImageFile(file) {
    const error = getImageFileError(file);
    if (!error) return true;
    toast.error(i18n.t(`checkout:imageUpload.${error}`));
    return false;
}
