import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "../../../libs/db/prisma";
import type { PrismaClient } from "../../../libs/db/prisma";
import {
  TeacherRegistrationDto,
  StudentRegistrationDto,
  ParentRegistrationDto,
  LecturerRegistrationDto,
  TeacherFirebaseRegistrationDto,
  StudentFirebaseRegistrationDto,
  ParentFirebaseRegistrationDto,
  LecturerFirebaseRegistrationDto,
} from "../dtos/auth.dto";
import {
  CreateAdminDto,
  CreateSubAdminDto,
  CreateModeratorDto,
  CreateAssistantDto,
  CreateTeacherDto,
  CreateStudentDto,
  CreateParentDto,
  CreateLecturerDto,
} from "../dtos/admin.dto";
import {
  BaseUserData,
  CreatorContext,
  FirebaseUserData,
} from "../interfaces/auth.interface";
import {
  role_enum,
  portal_enum,
  auth_provider_enum,
  user_flag_enum,
} from "../generated/prisma/client";
import {
  ConflictError,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from "../../../libs/errors";
import { accountReviewService } from "./account-review.service";
import type { StaffActor } from "./staff-action-log.service";

// ============================================
// CONSTANTS
// ============================================

const SALT_ROUNDS = 12;
const TEACHER_SERIAL_RETRY_LIMIT = 5;

// ============================================
// USER MANAGEMENT SERVICE CLASS
// ============================================

class UserManagementService {
  constructor(private db: PrismaClient = prisma) {}

  /**
   * Increment user's analytics counters (safe to call inside a transaction when `tx` is provided).
   */
  async incrementUserAnalytics(
    user_id: number,
    totalSpentIncrement: number,
    purchasesIncrement: number,
    tx?: PrismaClient,
  ) {
    const client = tx ?? this.db;
    await client.user_analytics.upsert({
      where: { user_id },
      create: {
        user_id,
        total_spent: totalSpentIncrement,
        number_of_purchases: purchasesIncrement,
      },
      update: {
        total_spent: { increment: totalSpentIncrement },
        number_of_purchases: { increment: purchasesIncrement },
      },
    });
  }

  // ============================================
  // CREATE MAIN USERS (Local Registration)
  // ============================================

  async createTeacher(
    input: TeacherRegistrationDto,
    creator?: CreatorContext,
  ): Promise<{ user: any; email: string }> {
    const email = this.normalizeEmail(input.email);
    await this.ensureEmailNotExists(email);
    await this.ensurePhoneNotExists(input.phone);

    const [passwordHash, requiresReview] = await Promise.all([
      this.hashPassword(input.password),
      accountReviewService.roleRequiresReview(role_enum.Teacher),
    ]);

    for (let attempt = 0; attempt < TEACHER_SERIAL_RETRY_LIMIT; attempt += 1) {
      const serial = await this.generateTeacherSerial(input.subject_id, attempt);

      try {
        const user = await this.db.$transaction(async (tx) => {
          const created = await tx.users.create({
            data: {
              name: input.name,
              email,
              phone: input.phone,
              secondary_phone: input.secondary_phone,
              gender: input.gender,
              password: passwordHash,
              role: role_enum.Teacher,
              is_email_verified: !!creator,
              created_by: creator?.userId,
              confirmed: !requiresReview,
              auth_identities: {
                create: {
                  provider: "local",
                  provider_user_id: email,
                  provider_email: email,
                },
              },
              teachers: {
                create: {
                  serial,
                  is_primary: input.is_primary,
                  is_preparatory: input.is_preparatory,
                  is_secondary: input.is_secondary,
                  government_id: input.government_id,
                  zone_id: input.zone_id,
                  subject_id: input.subject_id,
                },
              },
              user_roles: {
                create: [
                  {
                    portal: portal_enum.store,
                    role: role_enum.Teacher,
                  },
                  {
                    portal: portal_enum.academy,
                    role: role_enum.Teacher,
                  },
                ],
              },
              user_analytics: {
                create: {},
              },
            },
            select: this.baseUserSelect(),
          });

          return created;
        });

        return { user, email };
      } catch (error) {
        if (this.isTeacherSerialUniqueConflict(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictError(
      "Unable to generate a unique teacher serial. Please try again.",
    );
  }

  async createStudent(
    input: StudentRegistrationDto,
    creator?: CreatorContext,
  ): Promise<{ user: any; email: string }> {
    const email = this.normalizeEmail(input.email);
    await this.ensureEmailNotExists(email);
    await this.ensurePhoneNotExists(input.phone);

    const [passwordHash, requiresReview] = await Promise.all([
      this.hashPassword(input.password),
      accountReviewService.roleRequiresReview(role_enum.Student),
    ]);

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.users.create({
        data: {
          name: input.name,
          email,
          phone: input.phone,
          secondary_phone: input.secondary_phone,
          gender: input.gender,
          password: passwordHash,
          role: role_enum.Student,
          is_email_verified: !!creator,
          created_by: creator?.userId,
          confirmed: !requiresReview,
          auth_identities: {
            create: {
              provider: "local",
              provider_user_id: email,
              provider_email: email,
            },
          },
          students: {
            create: {
              level_id: input.level_id,
              government_id: input.government_id,
              zone_id: input.zone_id,
              parent_phone_number: input.parent_phone_number,
              faction: input.faction,
            },
          },
          user_roles: {
            create: {
              portal: portal_enum.academy,
              role: role_enum.Student,
            },
          },
          user_analytics: {
            create: {},
          },
        },
        select: this.baseUserSelect(),
      });

      return created;
    });

    return { user, email };
  }

  async createParent(
    input: ParentRegistrationDto,
    creator?: CreatorContext,
  ): Promise<{ user: any; email: string }> {
    const email = this.normalizeEmail(input.email);
    await this.ensureEmailNotExists(email);
    await this.ensurePhoneNotExists(input.phone);

    const [passwordHash, requiresReview] = await Promise.all([
      this.hashPassword(input.password),
      accountReviewService.roleRequiresReview(role_enum.Parent),
    ]);

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.users.create({
        data: {
          name: input.name,
          email,
          phone: input.phone,
          secondary_phone: input.secondary_phone,
          gender: input.gender,
          password: passwordHash,
          role: role_enum.Parent,
          is_email_verified: !!creator,
          created_by: creator?.userId,
          confirmed: !requiresReview,
          auth_identities: {
            create: {
              provider: "local",
              provider_user_id: email,
              provider_email: email,
            },
          },
          parents: {
            create: {},
          },
          user_roles: {
            create: {
              portal: portal_enum.academy,
              role: role_enum.Parent,
            },
          },
          user_analytics: {
            create: {},
          },
        },
        select: this.baseUserSelect(),
      });

      return created;
    });

    return { user, email };
  }

  async createLecturer(
    input: LecturerRegistrationDto,
    creator?: CreatorContext,
  ): Promise<{ user: any; email: string }> {
    const email = this.normalizeEmail(input.email);
    await this.ensureEmailNotExists(email);
    await this.ensurePhoneNotExists(input.phone);

    const [passwordHash, requiresReview] = await Promise.all([
      this.hashPassword(input.password),
      accountReviewService.roleRequiresReview(role_enum.Lecturer),
    ]);

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.users.create({
        data: {
          name: input.name,
          email,
          phone: input.phone,
          secondary_phone: input.secondary_phone,
          gender: input.gender,
          password: passwordHash,
          role: role_enum.Lecturer,
          is_email_verified: !!creator,
          created_by: creator?.userId,
          confirmed: !requiresReview,
          auth_identities: {
            create: {
              provider: "local",
              provider_user_id: email,
              provider_email: email,
            },
          },
          lecturers: {
            create: {
              bio: input.bio,
              expertise: input.expertise,
            },
          },
          user_roles: {
            create: {
              portal: portal_enum.academy,
              role: role_enum.Lecturer,
            },
          },
          user_analytics: {
            create: {},
          },
        },
        select: this.baseUserSelect(),
      });

      return created;
    });

    return { user, email };
  }

  // ============================================
  // CREATE MAIN USERS (Firebase OAuth)
  // ============================================

  async createTeacherFromFirebase(
    input: TeacherFirebaseRegistrationDto,
    firebaseUser: FirebaseUserData,
  ): Promise<{ user: any; email: string }> {
    const [, , requiresReview] = await Promise.all([
      this.ensureEmailNotExists(firebaseUser.email),
      this.ensurePhoneNotExists(input.phone),
      accountReviewService.roleRequiresReview(role_enum.Teacher),
    ]);

    for (let attempt = 0; attempt < TEACHER_SERIAL_RETRY_LIMIT; attempt += 1) {
      const serial = await this.generateTeacherSerial(input.subject_id, attempt);

      try {
        const user = await this.db.$transaction(async (tx) => {
          const created = await tx.users.create({
            data: {
              name: firebaseUser.name,
              email: firebaseUser.email,
              phone: input.phone,
              secondary_phone: input.secondary_phone,
              gender: input.gender,
              is_email_verified: true,
              profile_pic_url: firebaseUser.photoUrl,
              role: role_enum.Teacher,
              confirmed: !requiresReview,
              auth_identities: {
                create: {
                  provider: firebaseUser.provider,
                  provider_user_id: firebaseUser.uid,
                  provider_email: firebaseUser.email,
                },
              },
              teachers: {
                create: {
                  serial,
                  is_primary: input.is_primary,
                  is_preparatory: input.is_preparatory,
                  is_secondary: input.is_secondary,
                  government_id: input.government_id,
                  zone_id: input.zone_id,
                  subject_id: input.subject_id,
                },
              },
              user_roles: {
                create: [
                  {
                    portal: portal_enum.store,
                    role: role_enum.Teacher,
                  },
                  {
                    portal: portal_enum.academy,
                    role: role_enum.Teacher,
                  },
                ],
              },
              user_analytics: {
                create: {},
              },
            },
            select: this.baseUserSelect(),
          });

          return created;
        });

        return { user, email: firebaseUser.email };
      } catch (error) {
        if (this.isTeacherSerialUniqueConflict(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictError(
      "Unable to generate a unique teacher serial. Please try again.",
    );
  }

  async createStudentFromFirebase(
    input: StudentFirebaseRegistrationDto,
    firebaseUser: FirebaseUserData,
  ): Promise<{ user: any; email: string }> {
    const [, , requiresReview] = await Promise.all([
      this.ensureEmailNotExists(firebaseUser.email),
      this.ensurePhoneNotExists(input.phone),
      accountReviewService.roleRequiresReview(role_enum.Student),
    ]);

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.users.create({
        data: {
          name: firebaseUser.name,
          email: firebaseUser.email,
          phone: input.phone,
          secondary_phone: input.secondary_phone,
          gender: input.gender,
          is_email_verified: true, // OAuth accounts are pre-verified
          profile_pic_url: firebaseUser.photoUrl,
          role: role_enum.Student,
          confirmed: !requiresReview,
          auth_identities: {
            create: {
              provider: firebaseUser.provider,
              provider_user_id: firebaseUser.uid,
              provider_email: firebaseUser.email,
            },
          },
          students: {
            create: {
              level_id: input.level_id,
              government_id: input.government_id,
              zone_id: input.zone_id,
              parent_phone_number: input.parent_phone_number,
              faction: input.faction,
            },
          },
          user_roles: {
            create: {
              portal: portal_enum.academy,
              role: role_enum.Student,
            },
          },
          user_analytics: {
            create: {},
          },
        },
        select: this.baseUserSelect(),
      });

      return created;
    });

    return { user, email: firebaseUser.email };
  }

  async createParentFromFirebase(
    input: ParentFirebaseRegistrationDto,
    firebaseUser: FirebaseUserData,
  ): Promise<{ user: any; email: string }> {
    const [, , requiresReview] = await Promise.all([
      this.ensureEmailNotExists(firebaseUser.email),
      this.ensurePhoneNotExists(input.phone),
      accountReviewService.roleRequiresReview(role_enum.Parent),
    ]);

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.users.create({
        data: {
          name: firebaseUser.name,
          email: firebaseUser.email,
          phone: input.phone,
          secondary_phone: input.secondary_phone,
          gender: input.gender,
          is_email_verified: true, // OAuth accounts are pre-verified
          profile_pic_url: firebaseUser.photoUrl,
          role: role_enum.Parent,
          confirmed: !requiresReview,
          auth_identities: {
            create: {
              provider: firebaseUser.provider,
              provider_user_id: firebaseUser.uid,
              provider_email: firebaseUser.email,
            },
          },
          parents: {
            create: {},
          },
          user_roles: {
            create: {
              portal: portal_enum.academy,
              role: role_enum.Parent,
            },
          },
          user_analytics: {
            create: {},
          },
        },
        select: this.baseUserSelect(),
      });

      return created;
    });

    return { user, email: firebaseUser.email };
  }

  async createLecturerFromFirebase(
    input: LecturerFirebaseRegistrationDto,
    firebaseUser: FirebaseUserData,
  ): Promise<{ user: any; email: string }> {
    const [, , requiresReview] = await Promise.all([
      this.ensureEmailNotExists(firebaseUser.email),
      this.ensurePhoneNotExists(input.phone),
      accountReviewService.roleRequiresReview(role_enum.Lecturer),
    ]);

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.users.create({
        data: {
          name: firebaseUser.name,
          email: firebaseUser.email,
          phone: input.phone,
          secondary_phone: input.secondary_phone,
          gender: input.gender,
          is_email_verified: true, // OAuth accounts are pre-verified
          profile_pic_url: firebaseUser.photoUrl,
          role: role_enum.Lecturer,
          confirmed: !requiresReview,
          auth_identities: {
            create: {
              provider: firebaseUser.provider,
              provider_user_id: firebaseUser.uid,
              provider_email: firebaseUser.email,
            },
          },
          lecturers: {
            create: {
              bio: input.bio,
              expertise: input.expertise,
            },
          },
          user_roles: {
            create: {
              portal: portal_enum.academy,
              role: role_enum.Lecturer,
            },
          },
          user_analytics: {
            create: {},
          },
        },
        select: this.baseUserSelect(),
      });

      return created;
    });

    return { user, email: firebaseUser.email };
  }

  // ============================================
  // CREATE NON-MAIN USERS (Admin creates these)
  // ============================================

  async createAdmin(
    input: CreateAdminDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    this.ensureCreatorIsAdmin(creator);

    const email = this.normalizeEmail(input.email);
    await this.ensureEmailNotExists(email);
    await this.ensurePhoneNotExists(input.phone);

    const passwordHash = await this.hashPassword(input.password);

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.users.create({
        data: {
          name: input.name,
          email,
          phone: input.phone,
          secondary_phone: input.secondary_phone,
          gender: input.gender,
          password: passwordHash,
          role: role_enum.Admin,
          is_email_verified: true, // Admin-created users are pre-verified
          created_by: creator.userId,
          auth_identities: {
            create: {
              provider: "local",
              provider_user_id: email,
              provider_email: email,
            },
          },
          user_roles: {
            createMany: {
              data: [
                { portal: portal_enum.store, role: role_enum.Admin },
                { portal: portal_enum.academy, role: role_enum.Admin },
              ],
            },
          },
        },
        select: this.baseUserSelect(),
      });

      return created;
    });

    return this.mapToBaseUserData(user);
  }

  async createSubAdmin(
    input: CreateSubAdminDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    this.ensureCreatorIsAdmin(creator);

    const email = this.normalizeEmail(input.email);
    await this.ensureEmailNotExists(email);
    await this.ensurePhoneNotExists(input.phone);

    const passwordHash = await this.hashPassword(input.password);

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.users.create({
        data: {
          name: input.name,
          email,
          phone: input.phone,
          secondary_phone: input.secondary_phone,
          gender: input.gender,
          password: passwordHash,
          role: role_enum.SubAdmin,
          is_email_verified: true,
          created_by: creator.userId,
          auth_identities: {
            create: {
              provider: "local",
              provider_user_id: email,
              provider_email: email,
            },
          },
          user_roles: {
            createMany: {
              data: [
                { portal: portal_enum.store, role: role_enum.SubAdmin },
                { portal: portal_enum.academy, role: role_enum.SubAdmin },
              ],
            },
          },
          user_analytics: {
            create: {},
          },
        },
        select: this.baseUserSelect(),
      });

      return created;
    });

    return this.mapToBaseUserData(user);
  }

  async createModerator(
    input: CreateModeratorDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    this.ensureCreatorIsAdminOrSubAdmin(creator);

    const email = this.normalizeEmail(input.email);
    await this.ensureEmailNotExists(email);
    await this.ensurePhoneNotExists(input.phone);

    const passwordHash = await this.hashPassword(input.password);

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.users.create({
        data: {
          name: input.name,
          email,
          phone: input.phone,
          secondary_phone: input.secondary_phone,
          gender: input.gender,
          password: passwordHash,
          role: role_enum.Moderator,
          is_email_verified: true,
          created_by: creator.userId,
          auth_identities: {
            create: {
              provider: "local",
              provider_user_id: email,
              provider_email: email,
            },
          },
          // Both portals, like the Admin and the SubAdmin: the store side is
          // what lets a Moderator into the dashboard.
          user_roles: {
            create: [
              { portal: portal_enum.store, role: role_enum.Moderator },
              { portal: portal_enum.academy, role: role_enum.Moderator },
            ],
          },
          user_analytics: {
            create: {},
          },
        },
        select: this.baseUserSelect(),
      });

      return created;
    });

    return this.mapToBaseUserData(user);
  }

  async createAssistant(
    input: CreateAssistantDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    this.ensureCreatorCanCreateAssistant(creator, input.lecturer_user_id);

    const email = this.normalizeEmail(input.email);

    // Verify both email uniqueness and lecturer existence concurrently
    const [, , lecturer] = await Promise.all([
      this.ensureEmailNotExists(email),
      this.ensurePhoneNotExists(input.phone),
      this.db.lecturers.findUnique({
        where: { user_id: input.lecturer_user_id },
      }),
    ]);

    if (!lecturer) {
      throw new NotFoundError("Lecturer not found");
    }

    const passwordHash = await this.hashPassword(input.password);

    const user = await this.db.$transaction(async (tx) => {
      const created = await tx.users.create({
        data: {
          name: input.name,
          email,
          phone: input.phone,
          secondary_phone: input.secondary_phone,
          gender: input.gender,
          password: passwordHash,
          role: role_enum.Assistant,
          is_email_verified: true,
          created_by: creator.userId,
          auth_identities: {
            create: {
              provider: "local",
              provider_user_id: email,
              provider_email: email,
            },
          },
          assistants: {
            create: {
              lecturer_user_id: input.lecturer_user_id,
            },
          },
          user_roles: {
            create: {
              portal: portal_enum.academy,
              role: role_enum.Assistant,
            },
          },
        },
        select: this.baseUserSelect(),
      });

      return created;
    });

    return this.mapToBaseUserData(user);
  }

  async createTeacherAsAdmin(
    input: CreateTeacherDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    this.ensureCreatorIsAdminOrSubAdmin(creator);

    const { user } = await this.createTeacher(input, creator);
    return this.mapToBaseUserData(user);
  }

  async createStudentAsAdmin(
    input: CreateStudentDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    this.ensureCreatorIsAdminOrSubAdmin(creator);

    const { user } = await this.createStudent(input, creator);
    return this.mapToBaseUserData(user);
  }

  async createParentAsAdmin(
    input: CreateParentDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    this.ensureCreatorIsAdminOrSubAdmin(creator);

    const { user } = await this.createParent(input, creator);
    return this.mapToBaseUserData(user);
  }

  async createLecturerAsAdmin(
    input: CreateLecturerDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    this.ensureCreatorIsAdminOrSubAdmin(creator);

    const { user } = await this.createLecturer(input, creator);
    return this.mapToBaseUserData(user);
  }

  // ============================================
  // USER LOOKUP METHODS
  // ============================================

  async findUserByEmail(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    return this.db.users.findFirst({
      where: { email: normalizedEmail },
      include: {
        user_roles: true,
        auth_identities: true,
      },
    });
  }

  async findUserById(userId: number) {
    return this.db.users.findUnique({
      where: { id: userId },
      include: {
        user_roles: true,
        auth_identities: true,
      },
    });
  }

  async findUserByAuthIdentity(
    provider: auth_provider_enum,
    providerUserId: string,
  ) {
    const identity = await this.db.auth_identities.findFirst({
      where: {
        provider,
        provider_user_id: providerUserId,
      },
      include: {
        users: {
          include: {
            user_roles: true,
            auth_identities: true,
          },
        },
      },
    });

    return identity?.users ?? null;
  }

  // ============================================
  // PASSWORD METHODS
  // ============================================

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await this.db.users.update({
      where: { id: userId },
      data: {
        password: passwordHash,
        password_changed_at: new Date(),
      },
    });
  }

  // ============================================
  // AUTH IDENTITY METHODS
  // ============================================

  async createAuthIdentity(
    userId: number,
    provider: auth_provider_enum,
    providerUserId: string,
    providerEmail?: string,
  ): Promise<void> {
    await this.db.auth_identities.create({
      data: {
        user_id: userId,
        provider,
        provider_user_id: providerUserId,
        provider_email: providerEmail,
      },
    });
  }

  async deleteAuthIdentity(identityId: number): Promise<void> {
    await this.db.auth_identities.delete({
      where: { id: identityId },
    });
  }

  async findAuthIdentity(userId: number, provider: auth_provider_enum) {
    return this.db.auth_identities.findFirst({
      where: {
        user_id: userId,
        provider,
      },
    });
  }

  async findAllAuthIdentities(userId: number) {
    return this.db.auth_identities.findMany({
      where: { user_id: userId },
      select: { id: true, provider: true, provider_email: true },
    });
  }

  // ============================================
  // EMAIL VERIFICATION TOKEN METHODS
  // ============================================

  async createEmailVerificationToken(
    userId: number,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.email_verification_tokens.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
      update: {
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null,
      },
    });
  }

  async findValidEmailVerificationToken(tokenHash: string) {
    return this.db.email_verification_tokens.findFirst({
      where: {
        token_hash: tokenHash,
        expires_at: { gt: new Date() },
        used_at: null,
      },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            secondary_phone: true,
            gender: true,
            is_email_verified: true,
            profile_pic_url: true,
            created_at: true,
            role: true,
            user_roles: {
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
  }

  async markEmailVerificationTokenUsed(tokenId: number): Promise<void> {
    await this.db.email_verification_tokens.update({
      where: { id: tokenId },
      data: { used_at: new Date() },
    });
  }

  async verifyUserEmail(userId: number) {
    return this.db.users.update({
      where: { id: userId },
      data: {
        is_email_verified: true,
        email_verified_at: new Date(),
      },
      select: this.baseUserSelect(),
    });
  }

  // ============================================
  // PASSWORD RESET TOKEN METHODS
  // ============================================

  async createPasswordResetToken(
    userId: number,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.password_reset_tokens.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
      update: {
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null,
      },
    });
  }

  async findValidPasswordResetToken(tokenHash: string) {
    return this.db.password_reset_tokens.findFirst({
      where: {
        token_hash: tokenHash,
        expires_at: { gt: new Date() },
        used_at: null,
      },
      include: {
        users: {
          select: { id: true, email: true, name: true },
        },
      },
    });
  }

  async markPasswordResetTokenUsed(tokenId: number): Promise<void> {
    await this.db.password_reset_tokens.update({
      where: { id: tokenId },
      data: { used_at: new Date() },
    });
  }

  async markPasswordResetTokenUsedByUserId(userId: number): Promise<void> {
    await this.db.password_reset_tokens.updateMany({
      where: { user_id: userId, used_at: null },
      data: { used_at: new Date() },
    });
  }

  // ============================================
  // DELETE USER
  // ============================================

  // Deleting an account wipes its personal data only (name, email, phones,
  // password, photo, Google sign-in) and signs it out everywhere. Its roles,
  // orders and records stay, under "Deleted account #id", so statistics and
  // order history are unchanged. Who deleted it, when and why are recorded.
  async deleteUser(userId: number, by?: { actorId?: number; reason?: string }): Promise<void> {
    const user = await this.db.users.findUnique({
      where: { id: userId },
      select: { id: true, is_deleted: true },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }
    if (user.is_deleted) {
      throw new BadRequestError("This account is already deleted");
    }

    await this.db.$transaction([
      this.db.users.update({
        where: { id: userId },
        data: {
          name: `حساب محذوف #${userId}`,
          email: null,
          phone: null,
          secondary_phone: null,
          password: null,
          profile_pic_url: null,
          updated_at: new Date(),
          deleted_at: new Date(),
          is_deleted: true,
          deleted_by: by?.actorId ?? null,
          delete_reason: by?.reason?.trim() ? by.reason.trim().slice(0, 1000) : null,
        },
      }),
      this.db.students.updateMany({ where: { user_id: userId }, data: { parent_phone_number: null } }),
      this.db.refresh_tokens.deleteMany({ where: { user_id: userId } }),
      this.db.auth_identities.deleteMany({ where: { user_id: userId } }),
    ]);
  }

  // ============================================
  // ADMIN: USER LISTING & SEARCH
  // ============================================

  async listUsers(
    options: {
      page?: number;
      limit?: number;
      search?: string;
      role?: role_enum;
      portal?: portal_enum;
      confirmed?: boolean;
      isDeleted?: boolean;
      includeFlag?: boolean;
      flag?: string;
    } = {},
  ) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (options.isDeleted !== undefined) {
      where.is_deleted = options.isDeleted;
    }

    if (options.confirmed !== undefined) {
      where.confirmed = options.confirmed;
    }

    // Account level (staff only).
    if (options.flag && options.includeFlag && (Object.values(user_flag_enum) as string[]).includes(options.flag)) {
      where.flag = options.flag as user_flag_enum;
    }

    // Text search on name, email, phone; a whole number also finds the
    // student with that serial.
    if (options.search) {
      const serial = /^\d{1,9}$/.test(options.search.trim()) ? Number(options.search.trim()) : null;
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
        { phone: { contains: options.search } },
        ...(serial !== null ? [{ students: { sequenced_id: serial } }] : []),
      ];
    }

    // Filter by role/portal via user_roles relation
    if (options.role || options.portal) {
      where.user_roles = {
        some: {
          ...(options.role ? { role: options.role } : {}),
          ...(options.portal ? { portal: options.portal } : {}),
        },
      };
    }

    const [users, total] = await Promise.all([
      this.db.users.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        select: {
          ...this.baseUserSelect(),
          ...(options.includeFlag ? { flag: true } : {}),
          is_deleted: true,
          role: true,
          confirmed: true,
          user_roles: {
            select: {
              id: true,
              portal: true,
              role: true,
            },
          },
          students: { select: { sequenced_id: true } },
        },
      }),
      this.db.users.count({ where }),
    ]);

    return {
      users: users.map(({ students, ...u }) => ({ ...u, student_serial: students?.sequenced_id ?? null })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserWithRoles(userId: number) {
    return this.getUserWithRolesByPermission(userId, false);
  }

  async getUserWithRolesByPermission(userId: number, includeFlag = false) {
    const user = await this.db.users.findUnique({
      where: { id: userId },
      select: {
        ...this.baseUserSelect(),
        ...(includeFlag ? { flag: true } : {}),
        role: true,
        is_deleted: true,
        confirmed: true,
        user_roles: {
          select: {
            id: true,
            portal: true,
            role: true,
          },
        },
        teachers: {
          include: { subjects: true, government: true, zones: true },
        },
        teaches_at: true,
        students: { include: { levels: true, government: true, zones: true } },
        lecturers: { select: { bio: true } },
        assistants: { include: { lecturers: true } },
        parents: { include: { government: true, zones: true } },
        deleted_at: true,
        user_analytics: true,
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }

  // The level change and its reason go to the staff action log together.
  async updateUserFlag(userId: number, flag: user_flag_enum, reason: string, actor: StaffActor) {
    const user = await this.db.users.findUnique({
      where: { id: userId },
      select: { id: true, flag: true },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const [updated] = await this.db.$transaction([
      this.db.users.update({
      where: { id: userId },
      data: {
        flag,
        updated_at: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        flag: true,
      },
    }),
      this.db.staff_action_logs.create({
        data: {
          entity_type: "user",
          entity_id: userId,
          action: "flag",
          reason,
          actor_user_id: actor.actorId,
          as_user_id: actor.asUserId,
          meta: { from: user.flag, to: flag },
        },
      }),
    ]);
    return updated;
  }

  // ============================================
  // ADMIN: ROLE MANAGEMENT
  // ============================================

  /**
   * Assign a new role+portal combination to a user.
   * Will fail if the user already has this exact role+portal.
   */
  async assignRole(userId: number, portal: portal_enum, role: role_enum) {
    // Fetch user and check existing role concurrently
    const [user, existing] = await Promise.all([
      this.db.users.findUnique({
        where: { id: userId },
        select: { id: true },
      }),
      this.db.user_roles.findFirst({
        where: { user_id: userId, portal, role },
      }),
    ]);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (existing) {
      throw new ConflictError(
        `User already has role ${role} on portal ${portal}`,
      );
    }

    const created = await this.db.user_roles.create({
      data: { user_id: userId, portal, role },
      select: { id: true, portal: true, role: true },
    });

    return created;
  }

  /**
   * Remove a specific role+portal combination from a user.
   * Prevents removing the last role (user must have at least one).
   */
  async revokeRole(userId: number, portal: portal_enum, role: role_enum) {
    // Find the specific role row and count total roles concurrently
    const [existing, totalRoles] = await Promise.all([
      this.db.user_roles.findFirst({
        where: { user_id: userId, portal, role },
      }),
      this.db.user_roles.count({
        where: { user_id: userId },
      }),
    ]);

    if (!existing) {
      throw new NotFoundError(
        `User does not have role ${role} on portal ${portal}`,
      );
    }

    // Prevent removing the last role
    if (totalRoles <= 1) {
      throw new BadRequestError(
        "Cannot remove the last role from a user. Delete the user instead.",
      );
    }

    await this.db.user_roles.delete({
      where: { id: existing.id },
    });

    return { removed: { portal, role } };
  }

  /**
   * Replace ALL roles for a user with a new set of roles.
   * Requires at least one role in the new set.
   */
  async setRoles(
    userId: number,
    roles: Array<{ portal: portal_enum; role: role_enum }>,
  ) {
    if (!roles.length) {
      throw new BadRequestError("Must provide at least one role");
    }

    // Verify user exists
    const user = await this.db.users.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Replace all roles in a transaction
    const result = await this.db.$transaction(async (tx) => {
      // Delete all existing roles
      await tx.user_roles.deleteMany({
        where: { user_id: userId },
      });

      // Create new roles
      await tx.user_roles.createMany({
        data: roles.map((r) => ({
          user_id: userId,
          portal: r.portal,
          role: r.role,
        })),
      });

      // Return the new roles
      return tx.user_roles.findMany({
        where: { user_id: userId },
        select: { id: true, portal: true, role: true },
      });
    });

    // Also update the legacy scalar role field to match the "primary" role
    await this.db.users.update({
      where: { id: userId },
      data: { role: roles[0].role },
    });

    return result;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  // One account per email and per phone. A banned account keeps its email
  // and phone, so it still blocks them; a deleted account has them wiped.
  async ensureEmailNotExists(email: string): Promise<void> {
    const existing = await this.db.users.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError("Email already in use", [
        { field: "email", message: "Email already in use" },
      ]);
    }
  }

  // The ways one Egyptian mobile number gets written (01..., +201..., 201...,
  // 00201...), so the same number in another format still counts as taken.
  phoneVariants(phone: string): string[] {
    const raw = phone.trim();
    const digits = raw.replace(/\D/g, "");
    const local = digits.replace(/^(?:00)?20(?=1\d{9}$)/, "0");
    if (!/^01\d{9}$/.test(local)) return [...new Set([raw, digits].filter(Boolean))];
    const rest = local.slice(1);
    return [...new Set([raw, local, `+20${rest}`, `20${rest}`, `0020${rest}`])];
  }

  async ensurePhoneNotExists(phone: string | null | undefined, exceptUserId?: number): Promise<void> {
    if (!phone || !phone.trim()) return;
    const existing = await this.db.users.findFirst({
      where: {
        phone: { in: this.phoneVariants(phone) },
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError("Phone number already in use", [
        { field: "phone", message: "Phone number already in use" },
      ]);
    }
  }

  async generateTeacherSerial(
    subjectId: number,
    offset: number = 0,
  ): Promise<string> {
    const subject = await this.db.subjects.findUnique({
      where: { id: subjectId },
      select: { title: true },
    });

    if (!subject) {
      throw new NotFoundError("Subject not found");
    }

    const subjectPrefix = subject.title.substring(0, 2).toUpperCase();

    // Find the highest existing serial number for this prefix.
    // Use only numeric suffixes so malformed/legacy serials do not force us back to 001.
    const teachers = await this.db.teachers.findMany({
      where: { serial: { startsWith: subjectPrefix } },
      select: { serial: true },
    });

    let maxSerialNo = 0;
    for (const teacher of teachers) {
      if (!teacher.serial) continue;
      const numPart = parseInt(
        teacher.serial.slice(subjectPrefix.length),
        10,
      );
      if (!isNaN(numPart) && numPart > maxSerialNo) {
        maxSerialNo = numPart;
      }
    }

    const serialNo = maxSerialNo + 1 + offset;
    return `${subjectPrefix}${String(serialNo).padStart(3, "0")}`;
  }

  private isTeacherSerialUniqueConflict(error: unknown): boolean {
    const code = (error as any)?.code;
    const target = (error as any)?.meta?.target;
    const errorText = `${(error as any)?.message ?? ""} ${JSON.stringify(
      (error as any)?.meta ?? {},
    )}`.toLowerCase();
    return (
      (code === "P2002" ||
        errorText.includes("uniqueconstraintviolation") ||
        errorText.includes("unique constraint")) &&
      (errorText.includes("teacher") ||
        errorText.includes("serial") ||
        (Array.isArray(target) && target.includes("serial")) ||
        target === "serial")
    );
  }

  generateSecureToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  async hashToken(token: string): Promise<string> {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  baseUserSelect() {
    return {
      id: true,
      name: true,
      email: true,
      phone: true,
      secondary_phone: true,
      gender: true,
      is_email_verified: true,
      confirmed: true,
      profile_pic_url: true,
      created_at: true,
    };
  }

  mapToBaseUserData(user: any): BaseUserData {
    return {
      id: user.id,
            name: user.name,
      email: user.email,
      phone: user.phone,
      secondary_phone: user.secondary_phone,
      gender: user.gender,
      is_email_verified: user.is_email_verified ?? false,
      confirmed: user.confirmed ?? false,
      profile_pic_url: user.profile_pic_url,
      created_at: user.created_at,
    };
  }

  private hasRole(creator: CreatorContext, ...allowed: role_enum[]): boolean {
    return (
      creator.roles?.some((r) => allowed.includes(r.role as role_enum)) ?? false
    );
  }

  private ensureCreatorIsAdmin(creator: CreatorContext): void {
    if (!this.hasRole(creator, role_enum.Admin)) {
      throw new ForbiddenError("Only Admin can perform this action");
    }
  }

  private ensureCreatorIsAdminOrSubAdmin(creator: CreatorContext): void {
    if (
      !this.hasRole(
        creator,
        role_enum.Admin,
        role_enum.SubAdmin,
        role_enum.Moderator,
      )
    ) {
      throw new ForbiddenError(
        "Only Admin, SubAdmin, or Moderator can perform this action",
      );
    }
  }

  private ensureCreatorCanCreateAssistant(
    creator: CreatorContext,
    lecturerUserId: number,
  ): void {
    const isAdminOrSubAdmin = this.hasRole(
      creator,
      role_enum.Admin,
      role_enum.SubAdmin,
      role_enum.Moderator,
    );
    const isLecturerCreatingOwn =
      this.hasRole(creator, role_enum.Lecturer) &&
      creator.userId === lecturerUserId;

    if (!isAdminOrSubAdmin && !isLecturerCreatingOwn) {
      throw new ForbiddenError(
        "Only Admin, SubAdmin, Moderator, or the Lecturer themselves can create an Assistant",
      );
    }
  }
}

// Export singleton instance
export const userManagementService = new UserManagementService();
export default UserManagementService;
