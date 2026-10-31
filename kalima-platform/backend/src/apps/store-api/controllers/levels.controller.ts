import { Request, Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { levelsService } from "../services/levels.service";
import { CreateLevelDto, UpdateLevelDto } from "../dtos/level.dto";
import { ValidationError, BadRequestError } from "../../../libs/errors";

async function validateDto<T extends object>(
  DtoClass: new () => T,
  body: unknown,
): Promise<T> {
  const dto = plainToInstance(DtoClass, body);
  const validationErrors = await validate(dto);

  if (validationErrors.length > 0) {
    const errors = validationErrors.flatMap((err) =>
      Object.values(err.constraints || {}),
    );
    throw new ValidationError(errors);
  }

  return dto;
}

export const levelsController = {
  async createLevel(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(CreateLevelDto, req.body);
      const created = await levelsService.createLevel(dto);
      res
        .status(201)
        .json({
          success: true,
          message: "Level created successfully",
          data: created,
        });
    } catch (err) {
      _next(err);
    }
  },

  async getAllLevels(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const active =
        req.query.active !== undefined
          ? req.query.active === "true"
          : undefined;
      const list = await levelsService.getAllLevels({ active });
      res.status(200).json({ success: true, results: list.length, data: list });
    } catch (err) {
      _next(err);
    }
  },

  async getAllStages(
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const list = await levelsService.getAllStages();
      res.status(200).json({ success: true, results: list.length, data: list });
    } catch (err) {
      _next(err);
    }
  },

  async getLevelById(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) throw new BadRequestError("Invalid level ID");
      const lvl = await levelsService.getLevelById(id);
      res.status(200).json({ success: true, data: lvl });
    } catch (err) {
      _next(err);
    }
  },

  async updateLevel(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) throw new BadRequestError("Invalid level ID");
      const dto = await validateDto(UpdateLevelDto, req.body);
      const updated = await levelsService.updateLevel(id, dto);
      res
        .status(200)
        .json({
          success: true,
          message: "Level updated successfully",
          data: updated,
        });
    } catch (err) {
      _next(err);
    }
  },

  async deleteLevel(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) throw new BadRequestError("Invalid level ID");
      await levelsService.deleteLevel(id);
      res
        .status(200)
        .json({ success: true, message: "Level deleted successfully" });
    } catch (err) {
      _next(err);
    }
  },
};
