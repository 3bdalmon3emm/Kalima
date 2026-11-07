import type { PrismaClient } from "../../../libs/db/prisma";
import { prisma } from "../../../libs/db/prisma";
import { CreateLevelDto, UpdateLevelDto } from "../dtos/level.dto";
import { CreateStageDto, UpdateStageDto } from "../dtos/stage.dto";
import { levels, stages } from "../generated/prisma/client";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../../libs/errors";

// Stage order first, then the level's own order; levels not yet placed in a
// stage fall to the end. The same order drives the yearly promotion.
const LEVEL_ORDER = [
  { stages: { sort_order: "asc" as const } },
  { sort_order: { sort: "asc" as const, nulls: "last" as const } },
  { title: "asc" as const },
];

const LEVEL_INCLUDE = {
  stages: { select: { id: true, title: true, title_ar: true, sort_order: true } },
};

class LevelsService {
  constructor(private db: PrismaClient = prisma) {}

  private async assertStage(stageId: number): Promise<void> {
    const stage = await this.db.stages.findUnique({ where: { id: stageId } });
    if (!stage) throw new BadRequestError("Stage not found");
  }

  async createLevel(dto: CreateLevelDto): Promise<levels> {
    const existing = await this.db.levels.findFirst({
      where: { title: dto.title },
    });
    if (existing)
      throw new ConflictError("Level with this title already exists");

    await this.assertStage(dto.stage_id);

    const created = await this.db.levels.create({
      data: {
        title: dto.title,
        title_ar: dto.title_ar,
        stage_id: dto.stage_id,
        sort_order: dto.sort_order,
        active: dto.active ?? true,
      },
      include: LEVEL_INCLUDE,
    });
    return created;
  }

  async getAllLevels(filters?: { active?: boolean }): Promise<levels[]> {
    const where: any = {};
    if (filters?.active !== undefined) where.active = filters.active;
    return this.db.levels.findMany({
      where,
      include: LEVEL_INCLUDE,
      orderBy: LEVEL_ORDER,
    });
  }

  async getAllStages(): Promise<stages[]> {
    return this.db.stages.findMany({ orderBy: { sort_order: "asc" } });
  }

  private async assertStageTitleFree(title: string, exceptId?: number) {
    const existing = await this.db.stages.findFirst({ where: { title } });
    if (existing && existing.id !== exceptId)
      throw new ConflictError("Stage with this title already exists");
  }

  async createStage(dto: CreateStageDto): Promise<stages> {
    await this.assertStageTitleFree(dto.title);
    return this.db.stages.create({
      data: {
        title: dto.title,
        title_ar: dto.title_ar,
        sort_order: dto.sort_order,
      },
    });
  }

  async updateStage(id: number, dto: UpdateStageDto): Promise<stages> {
    const stage = await this.db.stages.findUnique({ where: { id } });
    if (!stage) throw new NotFoundError("Stage not found");
    if (dto.title !== undefined) await this.assertStageTitleFree(dto.title, id);

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.title_ar !== undefined) data.title_ar = dto.title_ar;
    if (dto.sort_order !== undefined) data.sort_order = dto.sort_order;
    return this.db.stages.update({ where: { id }, data });
  }

  async deleteStage(id: number): Promise<void> {
    const stage = await this.db.stages.findUnique({ where: { id } });
    if (!stage) throw new NotFoundError("Stage not found");

    // Only an empty stage can go; its levels would otherwise lose their place
    // in the promotion order.
    const levelsCount = await this.db.levels.count({ where: { stage_id: id } });
    if (levelsCount > 0) {
      throw new BadRequestError("Cannot delete a stage that still has levels");
    }

    await this.db.stages.delete({ where: { id } });
  }

  async getLevelById(id: number): Promise<levels> {
    const lvl = await this.db.levels.findUnique({
      where: { id },
      include: LEVEL_INCLUDE,
    });
    if (!lvl) throw new NotFoundError("Level not found");
    return lvl;
  }

  async updateLevel(id: number, dto: UpdateLevelDto): Promise<levels> {
    const lvl = await this.db.levels.findUnique({ where: { id } });
    if (!lvl) throw new NotFoundError("Level not found");

    if (dto.title && dto.title !== lvl.title) {
      const existing = await this.db.levels.findFirst({
        where: { title: dto.title },
      });
      if (existing)
        throw new ConflictError("Level with this title already exists");
    }

    if (dto.stage_id !== undefined) await this.assertStage(dto.stage_id);

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.title_ar !== undefined) data.title_ar = dto.title_ar;
    if (dto.stage_id !== undefined) data.stage_id = dto.stage_id;
    if (dto.sort_order !== undefined) data.sort_order = dto.sort_order;
    if (dto.active !== undefined) data.active = dto.active;

    const updated = await this.db.levels.update({
      where: { id },
      data,
      include: LEVEL_INCLUDE,
    });
    return updated;
  }

  async deleteLevel(id: number): Promise<void> {
    const lvl = await this.db.levels.findUnique({ where: { id } });
    if (!lvl) throw new NotFoundError("Level not found");

    // prevent delete if students reference this level
    const studentsCount = await this.db.students.count({
      where: { level_id: id },
    });
    if (studentsCount > 0) {
      throw new BadRequestError(
        "Cannot delete level while students are assigned to it",
      );
    }

    await this.db.levels.delete({ where: { id } });
  }
}

export const levelsService = new LevelsService();
