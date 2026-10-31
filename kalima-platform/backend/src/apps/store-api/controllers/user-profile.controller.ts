import { Request, Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { userProfileService } from "../services/user-profile.service";
import { UpdateProfileDto } from "../dtos/user-profile.dto";
import { CreateTeachesAtDto, UpdateTeachesAtDto } from "../dtos/teaches-at.dto";
import {
  CreateSocialMediaDto,
  UpdateSocialMediaDto,
} from "../dtos/social-media.dto";
import {
  CreateParentChildDto,
  UpdateParentChildDto,
} from "../dtos/parent-children.dto";
import {
  ValidationError,
  BadRequestError,
  ForbiddenError,
} from "../../../libs/errors";
import { role_enum } from "../generated/prisma/client";

// ============================================
// Shared helpers
// ============================================

async function validateDto<T extends object>(
  DtoClass: new () => T,
  body: unknown,
): Promise<T> {
  const dto = plainToInstance(DtoClass, body);
  const errors = await validate(dto);
  if (errors.length > 0) {
    throw new ValidationError(
      errors.flatMap((e) => Object.values(e.constraints || {})),
    );
  }
  return dto;
}

function parseIntParam(
  raw: string | string[] | undefined,
  name: string,
): number {
  const val = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(val);
  if (!val || Number.isNaN(n) || n <= 0)
    throw new BadRequestError(`Invalid ${name}`);
  return n;
}

/** Extract authenticated user */
function getAuth(req: Request): {
  id: number;
  role: role_enum;
  roles: string[];
} {
  const user = req.user as any;
  const rawRoles = Array.isArray(user.roles) ? user.roles : [];
  const rolesList = rawRoles.map((r: any) => r.role || r);
  const primaryRole = rolesList.includes(role_enum.Admin)
    ? role_enum.Admin
    : rolesList.includes(role_enum.SubAdmin)
      ? role_enum.SubAdmin
      : rolesList.includes(role_enum.Moderator)
        ? role_enum.Moderator
      : rolesList[0] || null;
  return {
    id: user.userId || user.id,
    role: primaryRole,
    roles: rolesList,
  };
}

/**
 * Resolve the target user ID for an operation.
 *
 * Self-service routes (`/profile/me/*`) → authenticated user ID.
 * Admin routes (`/profile/users/:userId/*`) → param userId, admin-only.
 */
function resolveTargetUserId(req: Request): number {
  if (req.params.userId) {
    // Admin path
    const auth = getAuth(req);
    if (
      auth.role !== role_enum.Admin &&
      auth.role !== role_enum.SubAdmin &&
      auth.role !== role_enum.Moderator
    ) {
      throw new ForbiddenError("Not authorized to manage other users");
    }
    return parseIntParam(req.params.userId, "userId");
  }
  // Self path
  return getAuth(req).id;
}

/** Check the caller is Admin/SubAdmin OR owns the resource */
function assertOwnerOrAdmin(req: Request, ownerId: number): void {
  const auth = getAuth(req);
  if (
    auth.role !== role_enum.Admin &&
    auth.role !== role_enum.SubAdmin &&
    auth.role !== role_enum.Moderator &&
    auth.id !== ownerId
  ) {
    throw new ForbiddenError("Not authorized");
  }
}

// ============================================
// CONTROLLER
// ============================================

export const userProfileController = {
  // ─── Profile CRUD ──────────────────────────

  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = resolveTargetUserId(req);
      const profile = await userProfileService.getProfile(userId);
      res.status(200).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = resolveTargetUserId(req);
      const dto = await validateDto(UpdateProfileDto, req.body);

      // Determine which roles the target user has (for role-specific updates)
      const targetProfile = await userProfileService.getProfile(userId);
      const roles = (targetProfile.user_roles || []).map((r) => r.role);

      // Only the admin path (/users/:userId) may move a student to another
      // level; the self path keeps it locked.
      const updated = await userProfileService.updateProfile(
        userId,
        dto,
        roles,
        { allowLevelChange: Boolean(req.params.userId) },
      );
      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  },

  async uploadAvatar(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = resolveTargetUserId(req);
      const file = req.file as Express.Multer.File | undefined;
      if (!file) throw new BadRequestError("No image file provided");

      const result = await userProfileService.uploadProfilePic(userId, file);
      res.status(200).json({
        success: true,
        message: "Profile picture updated",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async deleteAvatar(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = resolveTargetUserId(req);
      await userProfileService.deleteProfilePic(userId);
      res.status(200).json({
        success: true,
        message: "Profile picture deleted",
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Teaches At (Teacher) ──────────────────

  async getAllTeachesAt(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = resolveTargetUserId(req);
      const list = await userProfileService.teachesAt.getAllTeachesAt({
        user_id: userId,
      });
      res.status(200).json({ success: true, results: list.length, data: list });
    } catch (err) {
      next(err);
    }
  },

  async createTeachesAt(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = resolveTargetUserId(req);
      const dto = await validateDto(CreateTeachesAtDto, req.body);
      dto.user_id = userId;

      const created = await userProfileService.teachesAt.createTeachesAt(dto);
      res
        .status(201)
        .json({ success: true, message: "Location added", data: created });
    } catch (err) {
      next(err);
    }
  },

  async updateTeachesAt(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseIntParam(req.params.id, "id");
      const existing = await userProfileService.teachesAt.getById(id);
      assertOwnerOrAdmin(req, existing.user_id);

      const dto = await validateDto(UpdateTeachesAtDto, req.body);
      // Prevent changing ownership unless admin
      const auth = getAuth(req);
      if (
        auth.role !== role_enum.Admin &&
        auth.role !== role_enum.SubAdmin &&
        auth.role !== role_enum.Moderator
      ) {
        dto.user_id = auth.id;
      }

      const updated = await userProfileService.teachesAt.updateTeachesAt(
        id,
        dto,
      );
      res
        .status(200)
        .json({ success: true, message: "Location updated", data: updated });
    } catch (err) {
      next(err);
    }
  },

  async deleteTeachesAt(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseIntParam(req.params.id, "id");
      const existing = await userProfileService.teachesAt.getById(id);
      assertOwnerOrAdmin(req, existing.user_id);

      await userProfileService.teachesAt.deleteTeachesAt(id);
      res.status(200).json({ success: true, message: "Location deleted" });
    } catch (err) {
      next(err);
    }
  },

  // ─── Social Media (Teacher) ────────────────

  async getAllSocialMedia(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = resolveTargetUserId(req);
      const list = await userProfileService.socialMedia.getAllSocialMedia({
        teacher_user_id: userId,
      });
      res.status(200).json({ success: true, results: list.length, data: list });
    } catch (err) {
      next(err);
    }
  },

  async createSocialMedia(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = resolveTargetUserId(req);
      const dto = await validateDto(CreateSocialMediaDto, req.body);
      dto.teacher_user_id = userId;

      const created =
        await userProfileService.socialMedia.createSocialMedia(dto);
      res
        .status(201)
        .json({ success: true, message: "Social media added", data: created });
    } catch (err) {
      next(err);
    }
  },

  async updateSocialMedia(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseIntParam(req.params.id, "id");
      const existing = await userProfileService.socialMedia.getById(id);
      assertOwnerOrAdmin(req, existing.teacher_user_id);

      const dto = await validateDto(UpdateSocialMediaDto, req.body);
      const auth = getAuth(req);
      if (
        auth.role !== role_enum.Admin &&
        auth.role !== role_enum.SubAdmin &&
        auth.role !== role_enum.Moderator
      ) {
        dto.teacher_user_id = auth.id;
      }

      const updated = await userProfileService.socialMedia.updateSocialMedia(
        id,
        dto,
      );
      res
        .status(200)
        .json({
          success: true,
          message: "Social media updated",
          data: updated,
        });
    } catch (err) {
      next(err);
    }
  },

  async deleteSocialMedia(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseIntParam(req.params.id, "id");
      const existing = await userProfileService.socialMedia.getById(id);
      assertOwnerOrAdmin(req, existing.teacher_user_id);

      await userProfileService.socialMedia.deleteSocialMedia(id);
      res.status(200).json({ success: true, message: "Social media deleted" });
    } catch (err) {
      next(err);
    }
  },

  // ─── Parent-Children ───────────────────────

  async getAllChildren(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = resolveTargetUserId(req);
      const list = await userProfileService.children.getAllParentChildren({
        parent_user_id: userId,
      });
      res.status(200).json({ success: true, results: list.length, data: list });
    } catch (err) {
      next(err);
    }
  },

  async addChild(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = resolveTargetUserId(req);
      const dto = await validateDto(CreateParentChildDto, req.body);
      dto.parent_user_id = userId;

      const created = await userProfileService.children.createParentChild(dto);
      res
        .status(201)
        .json({ success: true, message: "Child linked", data: created });
    } catch (err) {
      next(err);
    }
  },

  async updateChild(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseIntParam(req.params.id, "id");
      const existing = await userProfileService.children.getById(id);
      assertOwnerOrAdmin(req, existing.parent_user_id);

      const dto = await validateDto(UpdateParentChildDto, req.body);
      const auth = getAuth(req);
      if (
        auth.role !== role_enum.Admin &&
        auth.role !== role_enum.SubAdmin &&
        auth.role !== role_enum.Moderator
      ) {
        dto.parent_user_id = auth.id;
      }

      const updated = await userProfileService.children.updateParentChild(
        id,
        dto,
      );
      res
        .status(200)
        .json({ success: true, message: "Child updated", data: updated });
    } catch (err) {
      next(err);
    }
  },

  async deleteChild(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseIntParam(req.params.id, "id");
      const existing = await userProfileService.children.getById(id);
      assertOwnerOrAdmin(req, existing.parent_user_id);

      await userProfileService.children.deleteParentChild(id);
      res.status(200).json({ success: true, message: "Child unlinked" });
    } catch (err) {
      next(err);
    }
  },
};
