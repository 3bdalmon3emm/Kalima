import { firebaseAuth } from "../../../libs/auth/firebase";
import {
  consumeRefreshToken,
  generateRefreshToken,
  generateSingleSessionRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
  signAccessToken,
} from "../../../libs/auth/jwt";
import {
  TeacherRegistrationDto,
  StudentRegistrationDto,
  ParentRegistrationDto,
  LecturerRegistrationDto,
  TeacherFirebaseRegistrationDto,
  StudentFirebaseRegistrationDto,
  ParentFirebaseRegistrationDto,
  LecturerFirebaseRegistrationDto,
  LoginDto,
  ChangePasswordDto,
  SetPasswordDto,
} from "../dtos/auth.dto";
import {
  CreateAdminDto,
  CreateSubAdminDto,
  CreateModeratorDto,
  CreateAssistantDto,
} from "../dtos/admin.dto";
import {
  AuthTokens,
  LoginResponse,
  RegistrationResponse,
  RefreshResponse,
  PortalAccess,
  BaseUserData,
  CreatorContext,
  FirebaseUserData,
  LinkedProvider,
  LinkProviderResponse,
  ImpersonationResponse,
} from "../interfaces/auth.interface";
import {
  role_enum,
  portal_enum,
  auth_provider_enum,
} from "../generated/prisma/client";
import { getEmailService } from "../emails/email.service";
import fs from "fs";
import { userManagementService } from "./user-management.service";
import { isStaff, outranks } from "../../../libs/auth/roleRank";
import { largeGooglePhoto } from "../../../libs/auth/googlePhoto";
import { prisma } from "../../../libs/db/prisma";
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  ConflictError,
  InternalServerError,
} from "../../../libs/errors";

// ============================================
// CONSTANTS
// ============================================

const RESET_TOKEN_EXPIRY_HOURS = 24;
const VERIFICATION_TOKEN_EXPIRY_HOURS = 48;
const APP_URL = process.env.APP_URL;
const SUPPORT_URL = process.env.SUPPORT_URL;

// ============================================
// AUTH SERVICE CLASS
// ============================================

class AuthService {
  private userService = userManagementService;

  // ============================================
  // MAIN USER REGISTRATION (Local)
  // ============================================

  async registerTeacher(
    input: TeacherRegistrationDto,
  ): Promise<RegistrationResponse> {
    const { user, email } = await this.userService.createTeacher(input);
    const tokens = await this.issueTokens(user.id);
    await this.sendAccountVerificationEmail(
      user.id,
      user.name,
      email,
      role_enum.Teacher,
    );

    return {
      user: this.userService.mapToBaseUserData(user),
      tokens,
    };
  }

  async registerStudent(
    input: StudentRegistrationDto,
  ): Promise<RegistrationResponse> {
    const { user, email } = await this.userService.createStudent(input);
    const tokens = await this.issueTokens(user.id);
    await this.sendAccountVerificationEmail(
      user.id,
      user.name,
      email,
      role_enum.Student,
    );

    return {
      user: this.userService.mapToBaseUserData(user),
      tokens,
    };
  }

  async registerParent(
    input: ParentRegistrationDto,
  ): Promise<RegistrationResponse> {
    const { user, email } = await this.userService.createParent(input);
    const tokens = await this.issueTokens(user.id);
    await this.sendAccountVerificationEmail(
      user.id,
      user.name,
      email,
      role_enum.Parent,
    );

    return {
      user: this.userService.mapToBaseUserData(user),
      tokens,
    };
  }

  async registerLecturer(
    input: LecturerRegistrationDto,
  ): Promise<RegistrationResponse> {
    const { user, email } = await this.userService.createLecturer(input);
    const tokens = await this.issueTokens(user.id);
    await this.sendAccountVerificationEmail(
      user.id,
      user.name,
      email,
      role_enum.Lecturer,
    );

    return {
      user: this.userService.mapToBaseUserData(user),
      tokens,
    };
  }

  // ============================================
  // MAIN USER REGISTRATION (Firebase OAuth)
  // ============================================

  async registerTeacherFirebase(
    input: TeacherFirebaseRegistrationDto,
  ): Promise<RegistrationResponse> {
    const firebaseUser = await this.verifyFirebaseToken(input.idToken);
    const { user } = await this.userService.createTeacherFromFirebase(
      input,
      firebaseUser,
    );
    const tokens = await this.issueTokens(user.id);

    // Send Welcome OAuth Email
    if (user.email) {
      await getEmailService().sendWelcomeOAuthEmail(user.email, {
        name: user.name,
        role: this.formatRoleName(role_enum.Teacher),
        provider: firebaseUser.provider,
        loginUrl: `${APP_URL}/login`,
      });
    }

    return {
      user: this.userService.mapToBaseUserData(user),
      tokens,
    };
  }

  async registerStudentFirebase(
    input: StudentFirebaseRegistrationDto,
  ): Promise<RegistrationResponse> {
    const firebaseUser = await this.verifyFirebaseToken(input.idToken);
    const { user } = await this.userService.createStudentFromFirebase(
      input,
      firebaseUser,
    );
    const tokens = await this.issueTokens(user.id);

    // Send Welcome OAuth Email
    if (user.email) {
      await getEmailService().sendWelcomeOAuthEmail(user.email, {
        name: user.name,
        role: this.formatRoleName(role_enum.Student),
        provider: firebaseUser.provider,
        loginUrl: `${APP_URL}/login`,
      });
    }

    return {
      user: this.userService.mapToBaseUserData(user),
      tokens,
    };
  }

  async registerParentFirebase(
    input: ParentFirebaseRegistrationDto,
  ): Promise<RegistrationResponse> {
    const firebaseUser = await this.verifyFirebaseToken(input.idToken);
    const { user } = await this.userService.createParentFromFirebase(
      input,
      firebaseUser,
    );
    const tokens = await this.issueTokens(user.id);

    // Send Welcome OAuth Email
    if (user.email) {
      await getEmailService().sendWelcomeOAuthEmail(user.email, {
        name: user.name,
        role: this.formatRoleName(role_enum.Parent),
        provider: firebaseUser.provider,
        loginUrl: `${APP_URL}/login`,
      });
    }

    return {
      user: this.userService.mapToBaseUserData(user),
      tokens,
    };
  }

  async registerLecturerFirebase(
    input: LecturerFirebaseRegistrationDto,
  ): Promise<RegistrationResponse> {
    const firebaseUser = await this.verifyFirebaseToken(input.idToken);
    const { user } = await this.userService.createLecturerFromFirebase(
      input,
      firebaseUser,
    );
    const tokens = await this.issueTokens(user.id);

    // Send Welcome OAuth Email
    if (user.email) {
      await getEmailService().sendWelcomeOAuthEmail(user.email, {
        name: user.name,
        role: this.formatRoleName(role_enum.Lecturer),
        provider: firebaseUser.provider,
        loginUrl: `${APP_URL}/login`,
      });
    }

    return {
      user: this.userService.mapToBaseUserData(user),
      tokens,
    };
  }

  // ============================================
  // NON-MAIN USER CREATION (Admin creates these)
  // ============================================

  async createAdmin(
    input: CreateAdminDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    return this.userService.createAdmin(input, creator);
  }

  async createSubAdmin(
    input: CreateSubAdminDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    return this.userService.createSubAdmin(input, creator);
  }

  async createModerator(
    input: CreateModeratorDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    return this.userService.createModerator(input, creator);
  }

  async createAssistant(
    input: CreateAssistantDto,
    creator: CreatorContext,
  ): Promise<BaseUserData> {
    return this.userService.createAssistant(input, creator);
  }

  // ============================================
  // LOGIN METHODS
  // ============================================

  async login(input: LoginDto): Promise<LoginResponse> {
    const user = await this.userService.findUserByEmail(input.email);

    if (!user || !user.password) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const passwordValid = await this.userService.verifyPassword(
      input.password,
      user.password,
    );

    if (!passwordValid) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const tokens = await this.issueTokens(user.id);
    const portalAccess = this.calculatePortalAccess(user.user_roles);
    const linkedProviders = this.mapLinkedProviders(user.auth_identities);

    return {
      user: this.userService.mapToBaseUserData(user),
      tokens,
      portalAccess,
      linkedProviders,
    };
  }

  async loginFirebase(idToken: string): Promise<LoginResponse> {
    const firebaseUser = await this.verifyFirebaseToken(idToken);

    const user = await this.userService.findUserByAuthIdentity(
      firebaseUser.provider,
      firebaseUser.uid,
    );

    if (!user) {
      throw new NotFoundError(
        "No account found with this provider. Please register first.",
      );
    }

    const tokens = await this.issueTokens(user.id);
    const portalAccess = this.calculatePortalAccess(user.user_roles);
    const linkedProviders = this.mapLinkedProviders(user.auth_identities);

    return {
      user: this.userService.mapToBaseUserData(user),
      tokens,
      portalAccess,
      linkedProviders,
    };
  }

  // ============================================
  // TOKEN MANAGEMENT
  // ============================================

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    const payload = await consumeRefreshToken(refreshToken);

    if (!payload) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // A refresh keeps the same device; only a new sign-in signs out the others.
    const tokens = await this.issueTokens(payload.userId, undefined, { skipSingleSessionRevocation: true });

    return { tokens };
  }

  async logout(refreshToken: string): Promise<void> {
    await revokeRefreshToken(refreshToken);
  }

  async logoutAllDevices(userId: number): Promise<void> {
    await revokeAllRefreshTokensForUser(userId);
  }

  async startImpersonation(
    actor: CreatorContext,
    targetUserId: number,
  ): Promise<ImpersonationResponse> {
    if (actor.impersonation) {
      throw new ForbiddenError("Nested impersonation is not allowed");
    }

    const actorRoles = actor.roles ?? [];
    if (!isStaff(actorRoles)) {
      throw new ForbiddenError("Only admins can impersonate users");
    }

    if (actor.userId === targetUserId) {
      throw new BadRequestError("You cannot impersonate your own account");
    }

    const [actorUser, targetUser] = await Promise.all([
      this.userService.findUserById(actor.userId),
      this.userService.findUserById(targetUserId),
    ]);

    if (!actorUser) {
      throw new UnauthorizedError("Admin account not found");
    }

    if (!targetUser) {
      throw new NotFoundError("User not found");
    }

    // Admin, SubAdmin and Moderator impersonate only accounts below their own
    // rank (libs/auth/roleRank).
    const targetRoles = [
      ...((targetUser as any).role ? [(targetUser as any).role] : []),
      ...targetUser.user_roles.map((role) => role.role),
    ];
    if (!outranks(actorRoles, targetRoles)) {
      throw new ForbiddenError(
        "You cannot impersonate an account at your level or above",
      );
    }

    const startedAt = new Date().toISOString();
    await prisma.impersonation_logs.create({
      data: { actor_user_id: actor.userId, target_user_id: targetUser.id, started_at: new Date(startedAt) },
    });
    const tokens = await this.issueTokens(targetUser.id, {
      actorUserId: actor.userId,
      actorRoles: actorRoles.map((r) => ({ portal: r.portal, role: r.role })),
      targetUserId: targetUser.id,
      startedAt,
    }, { skipSingleSessionRevocation: true }); // the impersonated user stays signed in

    return {
      user: this.userService.mapToBaseUserData(targetUser),
      tokens,
      portalAccess: this.calculatePortalAccess(targetUser.user_roles),
      impersonation: {
        actorUser: this.userService.mapToBaseUserData(actorUser),
        targetUser: this.userService.mapToBaseUserData(targetUser),
        startedAt,
      },
    };
  }

  async stopImpersonation(actor: CreatorContext): Promise<{ message: string }> {
    if (!actor.impersonation) {
      throw new BadRequestError("No active impersonation session");
    }
    const { actorUserId, targetUserId, startedAt } = actor.impersonation;
    await prisma.impersonation_logs.updateMany({
      where: { actor_user_id: actorUserId, target_user_id: targetUserId, started_at: new Date(startedAt), ended_at: null },
      data: { ended_at: new Date() },
    });

    return { message: "Impersonation stopped" };
  }

  // ============================================
  // ACCOUNT DELETION
  // ============================================

  async deleteAccount(userId: number): Promise<{ message: string }> {
    await revokeAllRefreshTokensForUser(userId);
    await this.userService.deleteUser(userId, { actorId: userId, reason: "Deleted by the account owner" });
    return { message: "Account deleted successfully" };
  }

  // ============================================
  // PASSWORD MANAGEMENT
  // ============================================

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = this.userService.normalizeEmail(email);
    const emailService = getEmailService();

    const user = await this.userService.findUserByEmail(normalizedEmail);

    // Always return success to prevent email enumeration
    if (!user) {
      return {
        message:
          "If an account exists with this email, a reset link has been sent.",
      };
    }

    const resetToken = this.userService.generateSecureToken();
    const resetTokenHash = await this.userService.hashToken(resetToken);
    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    await this.userService.createPasswordResetToken(
      user.id,
      resetTokenHash,
      expiresAt,
    );

    const resetUrl = `${APP_URL}/auth/reset-password?token=${resetToken}`;
    const emailSent = await emailService.sendPasswordResetEmail(user.email!, {
      name: user.name,
      resetUrl,
      expiresInHours: RESET_TOKEN_EXPIRY_HOURS,
    });

    if (!emailSent) {
      await this.userService.markPasswordResetTokenUsedByUserId(user.id);
      throw new InternalServerError(
        "Unable to send the password reset email. Please try again later.",
      );
    }

    return {
      message:
        "If an account exists with this email, a reset link has been sent.",
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const tokenHash = await this.userService.hashToken(token);
    const emailService = getEmailService();

    const resetToken =
      await this.userService.findValidPasswordResetToken(tokenHash);

    if (!resetToken || !resetToken.users) {
      throw new BadRequestError("Invalid or expired reset token");
    }

    const passwordHash = await this.userService.hashPassword(newPassword);

    await this.userService.updatePassword(resetToken.users.id, passwordHash);
    await this.userService.markPasswordResetTokenUsed(resetToken.id);

    // Revoke all refresh tokens
    await revokeAllRefreshTokensForUser(resetToken.users.id);

    // Send password changed notification
    if (resetToken.users.email) {
      await emailService.sendPasswordChangedEmail(resetToken.users.email, {
        name: resetToken.users.name,
        changedAt: new Date(),
        ipAddress,
        supportUrl: SUPPORT_URL,
      });
    }

    return { message: "Password has been reset successfully." };
  }

  async changePassword(
    userId: number,
    input: ChangePasswordDto,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const emailService = getEmailService();

    const user = await this.userService.findUserById(userId);

    if (!user || !user.password) {
      throw new NotFoundError("User not found or has no password set");
    }

    const passwordValid = await this.userService.verifyPassword(
      input.currentPassword,
      user.password,
    );

    if (!passwordValid) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    const newPasswordHash = await this.userService.hashPassword(
      input.newPassword,
    );
    await this.userService.updatePassword(userId, newPasswordHash);

    // Revoke all refresh tokens to force re-login on all devices
    await revokeAllRefreshTokensForUser(userId);

    // Send password changed notification
    if (user.email) {
      await emailService.sendPasswordChangedEmail(user.email, {
        name: user.name,
        changedAt: new Date(),
        ipAddress,
        supportUrl: SUPPORT_URL,
      });
    }

    return { message: "Password changed successfully. Please log in again." };
  }

  async setPassword(
    userId: number,
    input: SetPasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.userService.findUserById(userId);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (user.password) {
      throw new ConflictError(
        "Password already set. Use change password instead.",
      );
    }

    const passwordHash = await this.userService.hashPassword(input.password);
    await this.userService.updatePassword(userId, passwordHash);

    // Create local auth identity if user has email
    if (user.email) {
      try {
        await this.userService.createAuthIdentity(
          userId,
          auth_provider_enum.local,
          user.email,
          user.email,
        );
      } catch {
        // Identity might already exist
      }
    }

    return { message: "Password set successfully." };
  }

  // ============================================
  // EMAIL VERIFICATION
  // ============================================

  async sendVerificationEmail(userId: number): Promise<{ message: string }> {
    const user = await this.userService.findUserById(userId);
    const emailService = getEmailService();

    if (!user || !user.email) {
      throw new NotFoundError("User not found or has no email");
    }

    if (user.is_email_verified) {
      return { message: "Email is already verified" };
    }

    const verificationToken = this.userService.generateSecureToken();
    const tokenHash = await this.userService.hashToken(verificationToken);
    const expiresAt = new Date(
      Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    await this.userService.createEmailVerificationToken(
      userId,
      tokenHash,
      expiresAt,
    );

    const verificationUrl = `${APP_URL}/auth/verify-email?token=${verificationToken}`;
    await emailService.sendVerificationEmail(user.email, {
      name: user.name,
      verificationUrl,
      expiresInHours: VERIFICATION_TOKEN_EXPIRY_HOURS,
    });

    return { message: "Verification email sent" };
  }

  async verifyEmail(
    token: string,
  ): Promise<{ message: string; user: BaseUserData }> {
    const emailService = getEmailService();
    const tokenHash = await this.userService.hashToken(token);

    const verificationToken =
      await this.userService.findValidEmailVerificationToken(tokenHash);

    if (!verificationToken || !verificationToken.users) {
      throw new BadRequestError("Invalid or expired verification token");
    }

    if (verificationToken.users.is_email_verified) {
      throw new ConflictError("Email is already verified");
    }

    const updatedUser = await this.userService.verifyUserEmail(
      verificationToken.users.id,
    );
    await this.userService.markEmailVerificationTokenUsed(verificationToken.id);

    // Send welcome email
    const loginUrl = `${APP_URL}/login`;
    // Use scalar role field; fall back to first user_role entry if null
    const userRole =
      (verificationToken.users as any).role ??
      (verificationToken.users as any).user_roles?.[0]?.role;
    const roleName = userRole ? this.formatRoleName(userRole) : "Member";

    if (verificationToken.users.email) {
      await emailService.sendWelcomeEmail(verificationToken.users.email, {
        name: verificationToken.users.name,
        role: roleName,
        loginUrl,
      });
    }

    return {
      message: "Email verified successfully",
      user: this.userService.mapToBaseUserData(updatedUser),
    };
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const normalizedEmail = this.userService.normalizeEmail(email);
    const user = await this.userService.findUserByEmail(normalizedEmail);

    // Always return success to prevent email enumeration
    if (!user) {
      return {
        message:
          "If an account exists with this email, a verification link has been sent.",
      };
    }

    if (user.is_email_verified) {
      return { message: "Email is already verified" };
    }

    await this.sendVerificationEmail(user.id);

    return {
      message:
        "If an account exists with this email, a verification link has been sent.",
    };
  }

  // ============================================
  // ACCOUNT LINKING
  // ============================================

  async linkFirebaseAccount(
    userId: number,
    idToken: string,
  ): Promise<LinkProviderResponse> {
    const firebaseUser = await this.verifyFirebaseToken(idToken);

    // Check if this Firebase account is already linked to another user
    const existingUser = await this.userService.findUserByAuthIdentity(
      firebaseUser.provider,
      firebaseUser.uid,
    );

    if (existingUser && existingUser.id !== userId) {
      throw new ConflictError("This account is already linked to another user");
    }

    if (existingUser && existingUser.id === userId) {
      throw new ConflictError("This account is already linked");
    }

    // Check if user already has this provider linked
    const existingIdentity = await this.userService.findAuthIdentity(
      userId,
      firebaseUser.provider,
    );

    if (existingIdentity) {
      throw new ConflictError(
        `You already have a ${firebaseUser.provider} account linked`,
      );
    }

    await this.userService.createAuthIdentity(
      userId,
      firebaseUser.provider,
      firebaseUser.uid,
      firebaseUser.email,
    );

    const identities = await this.userService.findAllAuthIdentities(userId);

    return {
      message: `${firebaseUser.provider} account linked successfully`,
      linkedProviders: this.mapLinkedProviders(identities),
    };
  }

  async unlinkProvider(
    userId: number,
    provider: auth_provider_enum,
  ): Promise<LinkProviderResponse> {
    const identity = await this.userService.findAuthIdentity(userId, provider);

    if (!identity) {
      throw new NotFoundError(`No ${provider} account is linked`);
    }

    const allIdentities = await this.userService.findAllAuthIdentities(userId);
    const user = await this.userService.findUserById(userId);

    const hasPassword = !!user?.password;
    const hasOtherProviders = allIdentities.length > 1;

    if (!hasPassword && !hasOtherProviders) {
      throw new BadRequestError(
        "Cannot unlink the only authentication method. Set a password first.",
      );
    }

    if (provider === auth_provider_enum.local && !hasOtherProviders) {
      throw new BadRequestError(
        "Cannot unlink local authentication. Link another provider first.",
      );
    }

    await this.userService.deleteAuthIdentity(identity.id);

    const remainingIdentities =
      await this.userService.findAllAuthIdentities(userId);

    return {
      message: `${provider} account unlinked successfully`,
      linkedProviders: this.mapLinkedProviders(remainingIdentities),
    };
  }

  async getLinkedProviders(userId: number): Promise<LinkedProvider[]> {
    const identities = await this.userService.findAllAuthIdentities(userId);
    return this.mapLinkedProviders(identities);
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private async sendAccountVerificationEmail(
    userId: number,
    name: string,
    email: string,
    role: role_enum,
  ): Promise<void> {
    const emailService = getEmailService();

    const verificationToken = this.userService.generateSecureToken();
    const tokenHash = await this.userService.hashToken(verificationToken);
    const expiresAt = new Date(
      Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    await this.userService.createEmailVerificationToken(
      userId,
      tokenHash,
      expiresAt,
    );

    const verificationUrl = `${APP_URL}/auth/verify-email?token=${verificationToken}`;
    const roleName = this.formatRoleName(role);

    await emailService.sendAccountCreatedEmail(email, {
      name,
      role: roleName,
      verificationUrl,
      expiresInHours: VERIFICATION_TOKEN_EXPIRY_HOURS,
    });
  }

  private async verifyFirebaseToken(
    idToken: string,
  ): Promise<FirebaseUserData> {
    const decoded = await firebaseAuth.verifyIdToken(idToken);

    if (!decoded.email) {
      throw new UnauthorizedError("Firebase token does not contain an email");
    }

    let provider: auth_provider_enum = auth_provider_enum.firebase;
    const signInProvider = decoded.firebase?.sign_in_provider;

    if (signInProvider === "google.com") {
      provider = auth_provider_enum.google;
    } else if (signInProvider === "facebook.com") {
      provider = auth_provider_enum.facebook;
    }

    return {
      uid: decoded.uid,
      email: decoded.email.toLowerCase(),
      name: decoded.name ?? decoded.email.split("@")[0],
      emailVerified: decoded.email_verified ?? false,
      photoUrl: largeGooglePhoto(decoded.picture),
      provider,
    };
  }

  private async issueTokens(
    userId: number,
    impersonation?: {
      actorUserId: number;
      actorRoles: Array<{ portal: string; role: string }>;
      targetUserId: number;
      startedAt: string;
    },
    options?: { skipSingleSessionRevocation?: boolean },
  ): Promise<AuthTokens> {
    const user = await this.userService.findUserById(userId);
    const roleRows = user?.user_roles ?? [];
    const shouldRevokeExistingSessions =
      !options?.skipSingleSessionRevocation &&
      !this.hasAdminSideRole(roleRows);

    const refresh = shouldRevokeExistingSessions
      ? await generateSingleSessionRefreshToken(userId)
      : await generateRefreshToken(userId);

    const accessToken = signAccessToken({
      userId,
      sessionId: refresh.id,
      roles: roleRows.map((r) => ({
        portal: r.portal,
        role: r.role,
      })),
      ...(impersonation ? { impersonation } : {}),
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
    };
  }

  // Staff roles that may stay signed in on several devices. The Admin is
  // not one of them: a new sign-in signs the Admin out everywhere else.
  private hasAdminSideRole(roles: Array<{ role: role_enum }>): boolean {
    const adminSideRoles: role_enum[] = [
      role_enum.SubAdmin,
      role_enum.Moderator,
      role_enum.Assistant,
    ];

    return roles.some((roleEntry) =>
      adminSideRoles.includes(roleEntry.role),
    );
  }

  private calculatePortalAccess(
    roles: Array<{ portal: portal_enum; role: role_enum }>,
  ): PortalAccess {
    const access: PortalAccess = {
      store: { hasAccess: false, roles: [] },
      academy: { hasAccess: false, roles: [] },
    };

    for (const roleEntry of roles) {
      if (roleEntry.portal === portal_enum.store) {
        access.store.hasAccess = true;
        access.store.roles.push(roleEntry.role);
      }
      if (roleEntry.portal === portal_enum.academy) {
        access.academy.hasAccess = true;
        access.academy.roles.push(roleEntry.role);
      }
    }

    return access;
  }

  private mapLinkedProviders(
    identities: Array<{
      provider: auth_provider_enum;
      provider_email?: string | null;
    }>,
  ): LinkedProvider[] {
    return identities.map((identity) => ({
      provider: identity.provider,
      providerEmail: identity.provider_email ?? undefined,
    }));
  }

  private formatRoleName(role: role_enum): string {
    const roleNames: Record<role_enum, string> = {
      [role_enum.Admin]: "Administrator",
      [role_enum.SubAdmin]: "Sub-Administrator",
      [role_enum.Teacher]: "معلم",
      [role_enum.Student]: "طالب",
      [role_enum.Parent]: "ولى أمر",
      [role_enum.Lecturer]: "محاضر",
      [role_enum.Assistant]: "مساعد",
      [role_enum.Moderator]: "مشرف",
    };
    return roleNames[role] || role;
  }
}

// Export singleton instance
export const authService = new AuthService();
export default AuthService;
