import { Request, Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { userManagementService } from "../services/user-management.service";
import { notificationService } from "../services/notification.service";
import { accountReviewService } from "../services/account-review.service";
import {
  AssignRoleDto,
  RevokeRoleDto,
  SetRolesDto,
  CreateAdminDto,
  CreateSubAdminDto,
  CreateModeratorDto,
  CreateAssistantDto,
  UpsertAccountReviewSettingsDto,
  CreateTeacherDto,
  CreateStudentDto,
  CreateParentDto,
  CreateLecturerDto,
  UpdateUserFlagDto,
  AdminResetUserPasswordDto,
} from "../dtos/admin.dto";
import { role_enum, portal_enum } from "../generated/prisma/client";
import {
  ValidationError,
  BadRequestError,
  ForbiddenError,
} from "../../../libs/errors";
import {
  TeacherRegistrationDto,
  StudentRegistrationDto,
  ParentRegistrationDto,
  LecturerRegistrationDto,
} from "../dtos/auth.dto";
import { CreatorContext } from "../interfaces/auth.interface";
import { userProfileService } from "../services/user-profile.service";
import { UpdateProfileDto } from "../dtos/user-profile.dto";
import { SendNotificationDto, NotificationFilterDto } from "../dtos/notification.dto";
import { revokeAllRefreshTokensForUser } from "../../../libs/auth/jwt";

// ============================================
// HELPER FUNCTIONS
// ============================================

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

const VALID_ROLES = Object.values(role_enum);
const VALID_PORTALS = Object.values(portal_enum);

function canViewOrEditUserFlag(user: any): boolean {
  const roles: Array<{ role: role_enum }> = user?.roles ?? [];
  const allowedRoles: role_enum[] = [
    role_enum.Admin,
    role_enum.SubAdmin,
    role_enum.Moderator,
  ];
  return roles.some((r) => allowedRoles.includes(r.role));
}

function canViewOrEditUserProfile(
  caller: any,
  userRoles: role_enum[],
): boolean {
  const callerRoles: role_enum[] = (caller?.roles ?? []).map(
    (r: any) => r.role,
  );

  const allowedRoles: role_enum[] = [
    role_enum.Admin,
    role_enum.SubAdmin,
    role_enum.Moderator,
  ];

  if (callerRoles.includes(role_enum.Admin)) {
    return true;
  }

  if (callerRoles.includes(role_enum.SubAdmin)) {
    if (userRoles.includes(role_enum.Admin)) return false;
    return true;
  }

  if (callerRoles.includes(role_enum.Moderator)) {
    if (
      userRoles.includes(role_enum.Admin) ||
      userRoles.includes(role_enum.SubAdmin)
    )
      return false;
    return true;
  }

  return false;
}

function canResetUserPassword(
  caller: any,
  userRoles: role_enum[],
): boolean {
  const callerRoles: role_enum[] = (caller?.roles ?? []).map(
    (r: any) => r.role,
  );

  if (callerRoles.includes(role_enum.Admin)) {
    return true;
  }

  if (callerRoles.includes(role_enum.SubAdmin)) {
    if (userRoles.includes(role_enum.Admin)) return false;
    return true;
  }

  return false;
}

function validateEnums(
  portal: string,
  role: string,
): { portal: portal_enum; role: role_enum } {
  if (!VALID_PORTALS.includes(portal as portal_enum)) {
    throw new BadRequestError(
      `Invalid portal "${portal}". Must be one of: ${VALID_PORTALS.join(", ")}`,
    );
  }
  if (!VALID_ROLES.includes(role as role_enum)) {
    throw new BadRequestError(
      `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`,
    );
  }
  return { portal: portal as portal_enum, role: role as role_enum };
}

// ============================================
// ADMIN CONTROLLER
// ============================================

export const adminController = {
  // ============================================
  // CREATE USER (ADMIN DASHBOARD)
  // ============================================

  /**
   * POST /admin/users
   * Body must include `role` and the corresponding fields for that role.
   */
  async createUser(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const role = req.body.role;
      if (!role) {
        throw new BadRequestError("Role is required in the request body");
      }

      if (!VALID_ROLES.includes(role as role_enum)) {
        throw new BadRequestError(`Invalid role "${role}".`);
      }

      const creator: CreatorContext = {
        userId: (req as any).user.userId || (req as any).user.id,
        roles: (req as any).user.roles || [],
      };

      let result;
      switch (role as role_enum) {
        case role_enum.Admin:
          const adminDto = await validateDto(CreateAdminDto, req.body);
          result = await userManagementService.createAdmin(adminDto, creator);
          break;
        case role_enum.SubAdmin:
          const subAdminDto = await validateDto(CreateSubAdminDto, req.body);
          result = await userManagementService.createSubAdmin(
            subAdminDto,
            creator,
          );
          break;
        case role_enum.Moderator:
          const modDto = await validateDto(CreateModeratorDto, req.body);
          result = await userManagementService.createModerator(modDto, creator);
          break;
        case role_enum.Assistant:
          const assistantDto = await validateDto(CreateAssistantDto, req.body);
          result = await userManagementService.createAssistant(
            assistantDto,
            creator,
          );
          break;
        case role_enum.Teacher:
          const hasPermTeacher = creator.roles.some((r) =>
            (
              [
                role_enum.Admin,
                role_enum.SubAdmin,
                role_enum.Moderator,
              ] as role_enum[]
            ).includes(r.role),
          );
          if (!hasPermTeacher)
            throw new ForbiddenError("Not allowed to create Teacher");
          const teacherDto = await validateDto(
            TeacherRegistrationDto,
            req.body,
          );
          result = (
            await userManagementService.createTeacher(teacherDto, creator)
          ).user;
          break;
        case role_enum.Student:
          const hasPermStudent = creator.roles.some((r) =>
            (
              [
                role_enum.Admin,
                role_enum.SubAdmin,
                role_enum.Moderator,
              ] as role_enum[]
            ).includes(r.role),
          );
          if (!hasPermStudent)
            throw new ForbiddenError("Not allowed to create Student");
          const studentDto = await validateDto(
            StudentRegistrationDto,
            req.body,
          );
          result = (
            await userManagementService.createStudent(studentDto, creator)
          ).user;
          break;
        case role_enum.Parent:
          const hasPermParent = creator.roles.some((r) =>
            (
              [
                role_enum.Admin,
                role_enum.SubAdmin,
                role_enum.Moderator,
              ] as role_enum[]
            ).includes(r.role),
          );
          if (!hasPermParent)
            throw new ForbiddenError("Not allowed to create Parent");
          const parentDto = await validateDto(ParentRegistrationDto, req.body);
          result = (
            await userManagementService.createParent(parentDto, creator)
          ).user;
          break;
        case role_enum.Lecturer:
          const hasPermLecturer = creator.roles.some((r) =>
            (
              [
                role_enum.Admin,
                role_enum.SubAdmin,
                role_enum.Moderator,
              ] as role_enum[]
            ).includes(r.role),
          );
          if (!hasPermLecturer)
            throw new ForbiddenError("Not allowed to create Lecturer");
          const lecturerDto = await validateDto(
            LecturerRegistrationDto,
            req.body,
          );
          result = (
            await userManagementService.createLecturer(lecturerDto, creator)
          ).user;
          break;
        default:
          throw new BadRequestError(
            `Role ${role} creation is not supported via this endpoint.`,
          );
      }

      const io = req.app.get("io");
      notificationService.notifyAdminsOfNewAccount(io, result);

      res.status(201).json({
        success: true,
        message: `User with role ${role} created successfully`,
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // CREATE SPECIFIC USERS (Dedicated Endpoints)
  // ============================================

  /**
   * POST /admin/teachers
   */
  async createTeacher(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(CreateTeacherDto, req.body);
      const creator: CreatorContext = {
        userId: (req as any).user.userId || (req as any).user.id,
        roles: (req as any).user.roles || [],
      };

      const result = await userManagementService.createTeacherAsAdmin(
        dto,
        creator,
      );

      const io = req.app.get("io");
      notificationService.notifyAdminsOfNewAccount(io, result);

      res.status(201).json({
        success: true,
        message: "Teacher created successfully",
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * POST /admin/students
   */
  async createStudent(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(CreateStudentDto, req.body);
      const creator: CreatorContext = {
        userId: (req as any).user.userId || (req as any).user.id,
        roles: (req as any).user.roles || [],
      };

      const result = await userManagementService.createStudentAsAdmin(
        dto,
        creator,
      );

      const io = req.app.get("io");
      notificationService.notifyAdminsOfNewAccount(io, result);

      res.status(201).json({
        success: true,
        message: "Student created successfully",
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * POST /admin/parents
   */
  async createParent(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(CreateParentDto, req.body);
      const creator: CreatorContext = {
        userId: (req as any).user.userId || (req as any).user.id,
        roles: (req as any).user.roles || [],
      };

      const result = await userManagementService.createParentAsAdmin(
        dto,
        creator,
      );

      const io = req.app.get("io");
      notificationService.notifyAdminsOfNewAccount(io, result);

      res.status(201).json({
        success: true,
        message: "Parent created successfully",
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * POST /admin/lecturers
   */
  async createLecturer(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(CreateLecturerDto, req.body);
      const creator: CreatorContext = {
        userId: (req as any).user.userId || (req as any).user.id,
        roles: (req as any).user.roles || [],
      };

      const result = await userManagementService.createLecturerAsAdmin(
        dto,
        creator,
      );

      const io = req.app.get("io");
      notificationService.notifyAdminsOfNewAccount(io, result);

      res.status(201).json({
        success: true,
        message: "Lecturer created successfully",
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // LIST / SEARCH USERS
  // ============================================

  /**
   * GET /admin/users?page=1&limit=20&search=john&role=Teacher&portal=store&confirmed=true
   */
  async listUsers(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const page = req.query.page
        ? parseInt(req.query.page as string, 10)
        : undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : undefined;
      const search = req.query.search as string | undefined;
      const role = req.query.role as string | undefined;
      const portal = req.query.portal as string | undefined;
      const confirmed = req.query.confirmed
        ? req.query.confirmed === "true"
        : undefined;

      // Validate role/portal enums if provided
      if (role && !VALID_ROLES.includes(role as role_enum)) {
        throw new BadRequestError(
          `Invalid role filter "${role}". Must be one of: ${VALID_ROLES.join(", ")}`,
        );
      }
      if (portal && !VALID_PORTALS.includes(portal as portal_enum)) {
        throw new BadRequestError(
          `Invalid portal filter "${portal}". Must be one of: ${VALID_PORTALS.join(", ")}`,
        );
      }

      const isDeleted = req.query.isDeleted
        ? req.query.isDeleted === "true"
        : undefined;

      const result = await userManagementService.listUsers({
        page,
        limit,
        search,
        role: role as role_enum | undefined,
        portal: portal as portal_enum | undefined,
        confirmed,
        isDeleted,
        includeFlag: canViewOrEditUserFlag((req as any).user),
      });

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // GET SINGLE USER WITH ROLES
  // ============================================

  /**
   * GET /admin/users/:userId
   */
  async getUser(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const userId = parseInt(req.params.userId as string, 10);
      if (isNaN(userId)) {
        throw new BadRequestError("Invalid user ID");
      }

      const user = await userManagementService.getUserWithRolesByPermission(
        userId,
        canViewOrEditUserFlag((req as any).user),
      );
      res.status(200).json({ success: true, data: user });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // UPDATE USER PROFILE
  // ============================================

  async updateUserProfile(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const userId = parseInt(req.params.userId as string, 10);
      if (isNaN(userId)) {
        throw new BadRequestError("Invalid user ID");
      }

      const targetProfile = await userProfileService.getProfile(userId);
      const roles = (targetProfile.user_roles || []).map((r) => r.role);

      if (!canViewOrEditUserProfile((req as any).user, roles)) {
        throw new ForbiddenError(
          "You don't have permission to edit this profile",
        );
      }

      const dto = await validateDto(UpdateProfileDto, req.body);
      const updated = await userProfileService.updateProfile(
        userId,
        dto,
        roles,
        { allowLevelChange: true },
      );
      res.status(200).json({
        success: true,
        message: "User profile updated successfully",
        data: updated,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // ADMIN PASSWORD RESET
  // ============================================

  async resetUserPassword(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const userId = parseInt(req.params.userId as string, 10);
      if (isNaN(userId)) {
        throw new BadRequestError("Invalid user ID");
      }

      const targetUser = await userManagementService.findUserById(userId);
      if (!targetUser) {
        throw new BadRequestError("User not found");
      }

      const roles: role_enum[] = [
        ...(targetUser.role ? [targetUser.role] : []),
        ...((targetUser.user_roles || []).map((r) => r.role)),
      ];

      if (!canResetUserPassword((req as any).user, roles)) {
        const callerRoles: role_enum[] = ((req as any).user?.roles ?? []).map(
          (r: any) => r.role,
        );
        if (
          callerRoles.includes(role_enum.SubAdmin) &&
          roles.includes(role_enum.Admin)
        ) {
          throw new ForbiddenError(
            "Sub-admins cannot reset passwords for admin accounts",
          );
        }
        throw new ForbiddenError(
          "You don't have permission to reset this user's password",
        );
      }

      const dto = await validateDto(AdminResetUserPasswordDto, req.body);
      const passwordHash = await userManagementService.hashPassword(dto.password);
      await userManagementService.updatePassword(userId, passwordHash);
      await revokeAllRefreshTokensForUser(userId);

      res.status(200).json({
        success: true,
        message: "User password updated successfully",
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // UPDATE USER FLAG
  // ============================================
  /**
   * PATCH /admin/users/:userId/flag
   * Body: { flag: "NORMAL" | "PRO" | "ELITE" | ... }
   */
  async updateUserFlag(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      if (!canViewOrEditUserFlag((req as any).user)) {
        throw new ForbiddenError(
          "Only Admin, SubAdmin, or Moderator can update user flag",
        );
      }

      const userId = parseInt(req.params.userId as string, 10);
      if (isNaN(userId)) {
        throw new BadRequestError("Invalid user ID");
      }

      const dto = await validateDto(UpdateUserFlagDto, req.body);
      const updated = await userManagementService.updateUserFlag(
        userId,
        dto.flag,
      );

      res.status(200).json({
        success: true,
        message: "User flag updated successfully",
        data: updated,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // ASSIGN ROLE
  // ============================================

  /**
   * POST /admin/users/:userId/roles
   * Body: { portal: "store", role: "Teacher" }
   */
  async assignRole(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const userId = parseInt(req.params.userId as string, 10);
      if (isNaN(userId)) {
        throw new BadRequestError("Invalid user ID");
      }

      const dto = await validateDto(AssignRoleDto, req.body);
      const validated = validateEnums(dto.portal, dto.role);

      const result = await userManagementService.assignRole(
        userId,
        validated.portal,
        validated.role,
      );

      res.status(201).json({
        success: true,
        message: `Role ${validated.role} on portal ${validated.portal} assigned to user ${userId}`,
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // REVOKE ROLE
  // ============================================

  /**
   * DELETE /admin/users/:userId/roles
   * Body: { portal: "store", role: "Teacher" }
   */
  async revokeRole(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const userId = parseInt(req.params.userId as string, 10);
      if (isNaN(userId)) {
        throw new BadRequestError("Invalid user ID");
      }

      const dto = await validateDto(RevokeRoleDto, req.body);
      const validated = validateEnums(dto.portal, dto.role);

      const result = await userManagementService.revokeRole(
        userId,
        validated.portal,
        validated.role,
      );

      res.status(200).json({
        success: true,
        message: `Role ${validated.role} on portal ${validated.portal} revoked from user ${userId}`,
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // SET ROLES (Replace All)
  // ============================================

  /**
   * PUT /admin/users/:userId/roles
   * Body: { roles: [{ portal: "store", role: "Teacher" }, { portal: "academy", role: "Teacher" }] }
   */
  async setRoles(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const userId = parseInt(req.params.userId as string, 10);
      if (isNaN(userId)) {
        throw new BadRequestError("Invalid user ID");
      }

      const dto = await validateDto(SetRolesDto, req.body);

      // Validate all role entries
      const validatedRoles: Array<{ portal: portal_enum; role: role_enum }> =
        [];
      for (const entry of dto.roles) {
        const validated = validateEnums(entry.portal, entry.role);
        validatedRoles.push(validated);
      }

      const result = await userManagementService.setRoles(
        userId,
        validatedRoles,
      );

      res.status(200).json({
        success: true,
        message: `Roles updated for user ${userId}`,
        data: result,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // GET USER ROLES
  // ============================================

  /**
   * GET /admin/users/:userId/roles
   */
  async getUserRoles(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const userId = parseInt(req.params.userId as string, 10);
      if (isNaN(userId)) {
        throw new BadRequestError("Invalid user ID");
      }

      const user = await userManagementService.getUserWithRoles(userId);

      res.status(200).json({
        success: true,
        data: {
          userId: user.id,
          name: user.name,
          roles: user.user_roles,
        },
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // ACCOUNT REVIEW
  // ============================================

  /**
   * GET /admin/account-review-settings
   */
  async getAccountReviewSettings(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const settings = await accountReviewService.getAllSettings();
      res.status(200).json({ success: true, data: settings });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * PUT /admin/account-review-settings
   * Body: { settings: [{ role, requires_review }, ...] }
   */
  async upsertAccountReviewSettings(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(UpsertAccountReviewSettingsDto, req.body);
      const adminId = (req as any).user?.userId ?? (req as any).user?.id;

      for (const entry of dto.settings) {
        await accountReviewService.upsertSetting(
          entry.role,
          entry.requires_review,
          adminId,
        );
      }

      const settings = await accountReviewService.getAllSettings();
      res.status(200).json({ success: true, data: settings });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * POST /admin/users/:userId/approve
   */
  async approveUser(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const userId = parseInt(req.params.userId as string, 10);
      if (isNaN(userId)) {
        throw new BadRequestError("Invalid user ID");
      }

      const user = await accountReviewService.approveUser(userId);
      res.status(200).json({
        success: true,
        message: "User approved",
        data: user,
      });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * POST /admin/users/:userId/reject
   */
  async rejectUser(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const userId = parseInt(req.params.userId as string, 10);
      if (isNaN(userId)) {
        throw new BadRequestError("Invalid user ID");
      }

      const user = await accountReviewService.rejectUser(userId);
      res.status(200).json({
        success: true,
        message: "User rejected",
        data: user,
      });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // DELETE USER
  // ============================================

  /**
   * DELETE /admin/users/:userId
   * Admin/SubAdmin can delete any user except themselves.
   */
  async deleteUser(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const callerUserId = (req as any).user?.userId;
      const targetUserId = Number(req.params.userId);

      if (isNaN(targetUserId)) {
        res.status(400).json({ success: false, message: "Invalid user ID" });
        return;
      }

      if (callerUserId === targetUserId) {
        res.status(400).json({
          success: false,
          message:
            "Cannot delete your own account via this endpoint. Use DELETE /auth/delete-account instead.",
        });
        return;
      }

      await userManagementService.deleteUser(targetUserId);
      res
        .status(200)
        .json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      _next(error);
    }
  },

  // ============================================
  // NOTIFICATIONS
  // ============================================

  /**
   * POST /admin/notifications
   * Send a notification to specific user(s) or all users with a given role.
   * Body: { user_ids?: number[], role?: role_enum, category, message_key, entity_type?, entity_id? }
   * Must provide EITHER user_ids OR role.
   */
  async sendNotification(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(SendNotificationDto, req.body);
      const adminId: number = (req as any).user?.userId;
      const io = req.app.get("io");

      const hasUserIds = dto.user_ids && dto.user_ids.length > 0;
      const hasRole = !!dto.role;

      if (!hasUserIds && !hasRole) {
        throw new BadRequestError(
          "Must specify either user_ids (array of user IDs) or role as the notification target",
        );
      }
      if (hasUserIds && hasRole) {
        throw new BadRequestError(
          "Provide either user_ids or role — not both",
        );
      }

      const opts = {
        entityType: dto.entity_type,
        entityId: dto.entity_id,
        createdBy: adminId,
      };

      let targetCount: number;
      let notificationIds: number[];

      if (hasRole && dto.role) {
        const row = await notificationService.sendToRole(
          io,
          dto.role,
          dto.category,
          dto.message_key,
          opts,
        );
        targetCount = 1;
        notificationIds = [row.id];
      } else {
        const userIds = dto.user_ids!;
        await notificationService.sendToUsers(
          io,
          userIds,
          dto.category,
          dto.message_key,
          opts,
        );
        targetCount = userIds.length;
        notificationIds = [];
      }

      res.status(201).json({
        success: true,
        message: hasRole
          ? `Notification sent to all users with role '${dto.role}'`
          : `Notification sent to ${targetCount} user(s)`,
        data: { target_count: targetCount, notification_ids: notificationIds },
      });
    } catch (error) {
      _next(error);
    }
  },

  /**
   * GET /admin/notifications
   * List all notifications (admin view), paginated.
   */
  async listNotifications(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    try {
      const dto = await validateDto(NotificationFilterDto, req.query);
      const result = await notificationService.getAll({
        category: dto.category,
        page: dto.page,
        limit: dto.limit,
      });

      res.status(200).json({
        success: true,
        results: result.notifications.length,
        pagination: {
          total: result.total,
          page: result.page,
          pages: result.pages,
          limit: result.limit,
        },
        data: { notifications: result.notifications },
      });
    } catch (error) {
      _next(error);
    }
  },
};

export default adminController;
