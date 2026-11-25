import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  MinLength,
  IsEnum,
  IsInt,
  IsPositive,
  IsBoolean,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from "class-validator";
import { Type } from "class-transformer";
import {
  gender_enum,
  role_enum,
  user_flag_enum,
} from "../generated/prisma/client";
import { UpdateProfileDto } from "./user-profile.dto";

// ============================================
// ADMIN USER CREATION DTOs
// ============================================

export class CreateAdminDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  secondary_phone?: string;

  @IsEnum(gender_enum)
  @IsNotEmpty()
  gender: gender_enum;
}

export class CreateSubAdminDto extends CreateAdminDto {
  // Same fields as admin
}

export class AdminResetUserPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

export class CreateModeratorDto extends CreateAdminDto {
  // Same fields as admin
}

export class CreateAssistantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  secondary_phone?: string;

  @IsEnum(gender_enum)
  @IsNotEmpty()
  gender: gender_enum;

  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  lecturer_user_id: number;
}

export class CreateTeacherDto extends CreateAdminDto {
  @IsBoolean()
  @IsNotEmpty()
  is_primary: boolean;

  @IsBoolean()
  @IsNotEmpty()
  is_preparatory: boolean;

  @IsBoolean()
  @IsNotEmpty()
  is_secondary: boolean;

  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  government_id: number;

  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  zone_id: number;

  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  subject_id: number;
}

export class CreateStudentDto extends CreateAdminDto {
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  level_id: number;

  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  government_id: number;

  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  zone_id: number;

  @IsString()
  @IsNotEmpty()
  parent_phone_number: string;

  @IsString()
  @IsOptional()
  faction?: string;
}

export class CreateParentDto extends CreateAdminDto {
  // Parent only needs base user fields
}

export class CreateLecturerDto extends CreateAdminDto {
  @IsString()
  @IsOptional()
  bio?: string;

  @IsString()
  @IsOptional()
  expertise?: string;
}

// ============================================
// ROLE MANAGEMENT DTOs
// ============================================

export class AssignRoleDto {
  @IsString()
  @IsNotEmpty()
  portal: string; // portal_enum value: "store" | "academy"

  @IsString()
  @IsNotEmpty()
  role: string; // role_enum value: "Admin" | "SubAdmin" | "Teacher" | etc.
}

export class RevokeRoleDto {
  @IsString()
  @IsNotEmpty()
  portal: string;

  @IsString()
  @IsNotEmpty()
  role: string;
}

export class RoleEntryDto {
  @IsString()
  @IsNotEmpty()
  portal: string;

  @IsString()
  @IsNotEmpty()
  role: string;
}

export class SetRolesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RoleEntryDto)
  roles: RoleEntryDto[];
}

// ============================================
// USER LISTING / QUERY DTOs
// ============================================

export class ListUsersQueryDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  page?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  portal?: string;
}

// ============================================
// ACCOUNT REVIEW DTOs
// ============================================

export class AccountReviewSettingEntryDto {
  @IsEnum(role_enum)
  role: role_enum;

  @IsBoolean()
  requires_review: boolean;
}

export class UpsertAccountReviewSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AccountReviewSettingEntryDto)
  settings: AccountReviewSettingEntryDto[];
}

export class UpdateUserFlagDto {
  @IsEnum(user_flag_enum)
  flag: user_flag_enum;

  // Why the account's level changed; staff see it, the user never does.
  @IsOptional()
  @IsString()
  reason?: string;
}
