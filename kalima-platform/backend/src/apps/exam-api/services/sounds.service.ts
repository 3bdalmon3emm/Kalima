import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import { BadRequestError, NotFoundError } from "../../../libs/errors";
import { mediaService } from "./media.service";

// Sounds for the result celebration. The bands are fixed; the admin adds and
// removes any number of sounds per band, and one is picked at random.

export const SOUND_BANDS = ["pass", "good", "great", "perfect"] as const;
export type SoundBand = (typeof SOUND_BANDS)[number];

class SoundsService {
  constructor(private db: PrismaClient = prisma) {}

  async list() {
    const rows = await this.db.ex_celebration_sounds.findMany({ orderBy: [{ band: "asc" }, { created_at: "asc" }] });
    const withUrls = await Promise.all(rows.map(async (r) => ({
      id: r.id, band: r.band, original_filename: r.original_filename, url: await mediaService.url(r.storage_key),
    })));
    return Object.fromEntries(SOUND_BANDS.map((b) => [b, withUrls.filter((r) => r.band === b)]));
  }

  async add(band: string, file: Express.Multer.File | undefined, userId: number) {
    if (!SOUND_BANDS.includes(band as SoundBand)) throw new BadRequestError("Invalid band");
    if (!file) throw new BadRequestError("File is required");
    const key = await mediaService.storeSound(file, band);
    const row = await this.db.ex_celebration_sounds.create({
      data: {
        band,
        storage_key: key,
        mime_type: file.mimetype,
        size_bytes: file.size,
        original_filename: file.originalname?.slice(0, 255) || null,
        created_by: userId,
      },
    });
    return { id: row.id, band, original_filename: row.original_filename, url: await mediaService.url(key) };
  }

  // The row goes; the file stays in storage like other removed media.
  async remove(id: number) {
    const row = await this.db.ex_celebration_sounds.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("Sound not found");
    await this.db.ex_celebration_sounds.delete({ where: { id } });
  }

  async randomFor(band: string) {
    const rows = await this.db.ex_celebration_sounds.findMany({ where: { band }, select: { storage_key: true } });
    if (!rows.length) return null;
    return mediaService.url(rows[Math.floor(Math.random() * rows.length)].storage_key);
  }
}

export const soundsService = new SoundsService();
