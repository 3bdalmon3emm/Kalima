import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { role_enum, notification_key_enum } from "../generated/prisma/client";

// Valid category numbers (4, 5, 6 are reserved)
const VALID_CATEGORIES = [1, 2, 3, 7, 8, 9, 10];

/**
 * DTO for admin sending a generic notification.
 * Targeting: provide either user_ids OR role — not both, not neither.
 */
export class SendNotificationDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  user_ids?: number[];

  @IsOptional()
  @IsEnum(role_enum)
  role?: role_enum;

  @IsNumber()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  category!: number;

  @IsEnum(notification_key_enum)
  message_key!: notification_key_enum;

  @IsOptional()
  @IsString()
  entity_type?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  entity_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  target_link?: string;

  // Written by the admin: the title and the text the user reads.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;
}

/**
 * DTO for filtering a user's own notifications.
 */
export class NotificationFilterDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  category?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  is_read?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
