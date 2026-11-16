import QRCode from "qrcode";

// The public address students open. Printed QR codes point here, so it
// comes from the configuration (default: the production site), never from
// the server the request happened to reach.
export const publicAppUrl = () => (process.env.PUBLIC_APP_URL || "https://kalima-edu.com").replace(/\/+$/, "");

export const examUrl = (code: string) => `${publicAppUrl()}/e/${code}`;

export const qrPng = (code: string) => QRCode.toBuffer(examUrl(code), { type: "png", width: 600, margin: 2 });

// A file name from an exam name: no slashes or reserved characters, and a
// number added when two exams share a name.
export function uniqueFileNames(names: string[], ext: string) {
  const seen = new Map<string, number>();
  return names.map((raw) => {
    const base = (raw || "exam").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "exam";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? `${base}.${ext}` : `${base} (${n}).${ext}`;
  });
}
