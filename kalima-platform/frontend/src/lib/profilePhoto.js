// The largest version of a profile photo: Google photos at their original
// size (=s0); any other photo as it is.
export function largestPhotoUrl(url) {
    if (!url) return url;
    if (!/googleusercontent\.com/i.test(url)) return url;
    if (/=s\d+(-c)?$/.test(url)) return url.replace(/=s\d+(-c)?$/, '=s0');
    return `${url}=s0`;
}
