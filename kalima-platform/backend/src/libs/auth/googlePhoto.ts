// Google sends a profile photo link sized 96 px ("...=s96-c"). Asking for
// 800 px gets the same photo large (as large as the original allows).
export function largeGooglePhoto(url?: string | null): string | undefined {
  if (!url) return url ?? undefined;
  if (!/googleusercontent\.com/i.test(url)) return url;
  if (/=s\d+(-c)?$/.test(url)) return url.replace(/=s\d+(-c)?$/, "=s800-c");
  if (/\/s\d+(-c)?\//.test(url)) return url.replace(/\/s\d+(-c)?\//, "/s800-c/");
  return `${url}=s800-c`;
}
