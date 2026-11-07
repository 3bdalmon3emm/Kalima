import type { PrismaClient } from "../../../libs/db/prisma";
import { prisma } from "../../../libs/db/prisma";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "../../../libs/errors";
import { imageService } from "./image.service";
import { teachesAtService } from "./teaches-at.service";
import { socialMediaService } from "./social-media.service";
import { parentChildrenService } from "./parent-children.service";
import type { UpdateProfileDto } from "../dtos/user-profile.dto";
import { gender_enum, role_enum } from "../generated/prisma/client";

// ============================================
// Includes for getProfile query
// ============================================

const PROFILE_INCLUDE = {
  user_roles: { select: { portal: true, role: true } },
  user_analytics: true,
  teachers: {
    select: {
      serial: true,
      is_primary: true,
      is_preparatory: true,
      is_secondary: true,
      government_id: true,
      zone_id: true,
      subject_id: true,
      government: { select: { id: true, title: true } },
      zones: { select: { id: true, title: true } },
      subjects: { select: { id: true, title: true } },
    },
  },
  students: {
    select: {
      level_id: true,
      government_id: true,
      zone_id: true,
      parent_phone_number: true,
      sequenced_id: true,
      faction: true,
      graduated: true,
      promotion_notice: true,
      levels: { select: { id: true, title: true, title_ar: true, stage_id: true } },
      government: { select: { id: true, title: true } },
      zones: { select: { id: true, title: true } },
    },
  },
  parents: {
    select: {
      government_id: true,
      zone_id: true,
      government: { select: { id: true, title: true } },
      zones: { select: { id: true, title: true } },
    },
  },
  lecturers: { select: { bio: true, expertise: true } },
} as const;

// ============================================
// USER PROFILE SERVICE
// ============================================

class UserProfileService {
  constructor(private db: PrismaClient = prisma) {}

  // ==========================================
  // GET PROFILE
  // ==========================================

  async getProfile(userId: number) {
    const user = await this.db.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        secondary_phone: true,
        gender: true,
        profile_pic_url: true,
        is_email_verified: true,
        created_at: true,
        ...PROFILE_INCLUDE,
      },
    });
    if (!user) throw new NotFoundError("User not found");

    let data: any = user;
    if (
      user.user_roles.some(
        (role) =>
          role.role === role_enum.Admin ||
          role.role === role_enum.SubAdmin ||
          role.role === role_enum.Moderator,
      )
    ) {
      const userCreatedRaw = await this.db.users.groupBy({
        by: ["role"],
        where: { created_by: userId },
        _count: {
          id: true,
        },
      });

      const userCreated = {
        Admin: 0,
        SubAdmin: 0,
        Moderator: 0,
        Teacher: 0,
        Student: 0,
        Parent: 0,
        Lecturer: 0,
        Assistant: 0,
      };

      userCreatedRaw.forEach((item) => {
        if (item.role in userCreated) {
          (userCreated as any)[item.role] = item._count.id;
        }
      });

      data = { ...data, userCreated: userCreated };
    }

    return data;
  }

  // ==========================================
  // UPDATE PROFILE
  // ==========================================

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
    userRoles: string[],
    options: { allowLevelChange?: boolean } = {},
  ) {
    const user = await this.db.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    // ── Basic fields (all roles) ──
    const userData: Record<string, unknown> = {};
    if (dto.name !== undefined) userData.name = dto.name;
    if (dto.phone !== undefined) userData.phone = dto.phone;
    if (dto.secondary_phone !== undefined)
      userData.secondary_phone = dto.secondary_phone;
    userData.updated_at = new Date();

    await this.db.users.update({ where: { id: userId }, data: userData });

    // ── Teacher-specific ──
    if (userRoles.includes("Teacher")) {
      const teacherData: Record<string, unknown> = {};
      const [subj, gov, zone] = await Promise.all([
        dto.subject_id != null
          ? this.db.subjects.findUnique({ where: { id: dto.subject_id } })
          : null,
        dto.government_id != null
          ? this.db.government.findUnique({ where: { id: dto.government_id } })
          : null,
        dto.zone_id != null
          ? this.db.zones.findUnique({ where: { id: dto.zone_id } })
          : null,
      ]);

      let hasTeacherUpdate = false;
      if (dto.subject_id !== undefined) {
        if (!subj) throw new NotFoundError("Subject not found");
        teacherData.subject_id = dto.subject_id;
        hasTeacherUpdate = true;
      }
      if (dto.government_id !== undefined) {
        if (!gov) throw new NotFoundError("Government not found");
        teacherData.government_id = dto.government_id;
        hasTeacherUpdate = true;
      }
      if (dto.zone_id !== undefined) {
        if (!zone) throw new NotFoundError("Zone not found");
        teacherData.zone_id = dto.zone_id;
        hasTeacherUpdate = true;
      }

      if (
        dto.is_primary !== undefined &&
        dto.is_primary !== teacherData.is_primary
      ) {
        teacherData.is_primary = dto.is_primary;
        hasTeacherUpdate = true;
      }

      if (
        dto.is_preparatory !== undefined &&
        dto.is_preparatory !== teacherData.is_preparatory
      ) {
        teacherData.is_preparatory = dto.is_preparatory;
        hasTeacherUpdate = true;
      }

      if (
        dto.is_secondary !== undefined &&
        dto.is_secondary !== teacherData.is_secondary
      ) {
        teacherData.is_secondary = dto.is_secondary;
        hasTeacherUpdate = true;
      }

      if (hasTeacherUpdate) {
        await this.db.teachers.upsert({
          where: { user_id: userId },
          update: teacherData,
          create: { user_id: userId, ...teacherData },
        });
      }
    }

    // ── Student-specific ──
    if (userRoles.includes("Student")) {
      const studentData: Record<string, unknown> = {};
      let hasStudentUpdate = false;

      if (dto.level_id !== undefined) {
        // A student never picks their own level after signup: it moves with
        // the yearly promotion or by an admin from the users list.
        const current = await this.db.students.findUnique({
          where: { user_id: userId },
          select: { level_id: true },
        });
        const changed = current?.level_id !== dto.level_id;
        if (changed && !options.allowLevelChange) {
          throw new ForbiddenError("Students cannot change their own level");
        }
        const lvl = await this.db.levels.findUnique({
          where: { id: dto.level_id },
        });
        if (!lvl) throw new NotFoundError("Level not found");
        studentData.level_id = dto.level_id;
        // A new level from the admin starts the student over: no longer a
        // graduate, and any pending promotion notice is settled.
        if (changed) {
          studentData.graduated = false;
          studentData.promotion_notice = false;
        }
        hasStudentUpdate = true;
      }
      if (dto.faction !== undefined) {
        studentData.faction = dto.faction;
        hasStudentUpdate = true;
      }
      if (dto.government_id !== undefined) {
        studentData.government_id = dto.government_id;
        hasStudentUpdate = true;
      }
      if (dto.zone_id !== undefined) {
        studentData.zone_id = dto.zone_id;
        hasStudentUpdate = true;
      }
      if (dto.parent_phone_number !== undefined) {
        studentData.parent_phone_number = dto.parent_phone_number;
        hasStudentUpdate = true;
      }

      if (hasStudentUpdate) {
        await this.db.students.upsert({
          where: { user_id: userId },
          update: studentData,
          create: { user_id: userId, ...studentData },
        });
      }
    }

    // ── Parent-specific ──
    if (userRoles.includes("Parent")) {
      const parentData: Record<string, unknown> = {};
      let hasParentUpdate = false;

      if (dto.government_id !== undefined) {
        parentData.government_id = dto.government_id;
        hasParentUpdate = true;
      }
      if (dto.zone_id !== undefined) {
        parentData.zone_id = dto.zone_id;
        hasParentUpdate = true;
      }

      if (hasParentUpdate) {
        await this.db.parents.upsert({
          where: { user_id: userId },
          update: parentData,
          create: { user_id: userId, ...parentData },
        });
      }
    }

    return this.getProfile(userId);
  }

  // ==========================================
  // UPLOAD PROFILE PICTURE
  // ==========================================

  async uploadProfilePic(userId: number, file: Express.Multer.File) {
    const user = await this.db.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    const image = await imageService.uploadImage(file, {
      compress: true,
      quality: 80,
    });

    await this.db.users.update({
      where: { id: userId },
      data: { profile_pic_url: image.url, updated_at: new Date() },
    });

    return { profile_pic_url: image.url };
  }

  // ==========================================
  // DELETE PROFILE PICTURE
  // ==========================================

  async deleteProfilePic(userId: number) {
    const user = await this.db.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    await this.db.users.update({
      where: { id: userId },
      data: { profile_pic_url: null, updated_at: new Date() },
    });

    return { success: true };
  }

  // ==========================================
  // TEACHES-AT (delegates to service)
  // ==========================================

  get teachesAt() {
    return teachesAtService;
  }

  // A student who signed up in June confirms the level the promotion gave
  // them, or picks the right one. This is the only time a student sets their
  // own level after signup, and it works once.
  async resolvePromotionNotice(userId: number, levelId?: number) {
    const student = await this.db.students.findUnique({
      where: { user_id: userId },
      select: { promotion_notice: true },
    });
    if (!student?.promotion_notice) {
      throw new BadRequestError("No pending promotion notice");
    }

    const data: Record<string, unknown> = { promotion_notice: false };
    if (levelId !== undefined) {
      const lvl = await this.db.levels.findUnique({ where: { id: levelId } });
      if (!lvl || lvl.active === false) throw new NotFoundError("Level not found");
      data.level_id = levelId;
      data.graduated = false;
    }
    await this.db.students.update({ where: { user_id: userId }, data });
  }

  // ==========================================
  // SOCIAL MEDIA (delegates to service)
  // ==========================================

  get socialMedia() {
    return socialMediaService;
  }

  // ==========================================
  // PARENT-CHILDREN (delegates to service)
  // ==========================================

  get children() {
    return parentChildrenService;
  }
}

export const userProfileService = new UserProfileService();
