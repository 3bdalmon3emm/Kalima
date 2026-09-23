import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export enum EBookletTemplateStatusDto {
  draft = "draft",
  published = "published",
  archived = "archived",
}

export enum EBookletHotspotTypeDto {
  text = "text",
  image = "image",
  video = "video",
  audio = "audio",
  file = "file",
  link = "link",
  question_answer = "question_answer",
}

export enum EBookletHotspotShapeDto {
  circle = "circle",
  rectangle = "rectangle",
  square = "square",
  triangle = "triangle",
  oval = "oval",
}

export enum EBookletHotspotTriggerDto {
  hover = "hover",
  click = "click",
  both = "both",
}

export enum EBookletInviteAccessPathDto {
  free = "free",
  offline_passcode = "offline_passcode",
  online_purchase = "online_purchase",
}

export enum EBookletPurchaseStatusDto {
  pending = "pending",
  awaiting_payment = "awaiting_payment",
  paid = "paid",
  needs_branding_info = "needs_branding_info",
  customization_in_progress = "customization_in_progress",
  ready = "ready",
  delivered = "delivered",
  cancelled = "cancelled",
  rejected = "rejected",
}

export class CreateEBookletTemplateDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marketing_price?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsInt()
  cover_file_id?: number;

  @IsOptional()
  @IsInt()
  category_id?: number;

  @IsOptional()
  @IsEnum(EBookletTemplateStatusDto)
  status?: EBookletTemplateStatusDto;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsArray()
  payment_method_ids?: number[];

  @IsOptional()
  @IsArray()
  required_fields?: Array<{ field_definition_id: number; is_required?: boolean }>;
}

export class UpdateEBookletTemplateDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marketing_price?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsInt()
  cover_file_id?: number;

  @IsOptional()
  @IsInt()
  category_id?: number;

  @IsOptional()
  @IsEnum(EBookletTemplateStatusDto)
  status?: EBookletTemplateStatusDto;

  @IsOptional()
  @IsArray()
  payment_method_ids?: number[];

  @IsOptional()
  @IsArray()
  required_fields?: Array<{ field_definition_id: number; is_required?: boolean }>;
}

export class UpsertEBookletHotspotDto {
  @IsInt()
  template_version_id!: number;

  @IsInt()
  @Min(1)
  page_number!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  x_percent!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  y_percent!: number;

  @IsNumber()
  @Min(0.1)
  @Max(20)
  radius_percent!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  reference_number?: number;

  @IsOptional()
  @IsEnum(EBookletHotspotShapeDto)
  shape?: EBookletHotspotShapeDto;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  width_percent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  height_percent?: number;

  @IsEnum(EBookletHotspotTypeDto)
  type!: EBookletHotspotTypeDto;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  text_content?: string;

  @IsOptional()
  @IsInt()
  asset_file_id?: number;

  @IsOptional()
  @IsEnum(EBookletHotspotTriggerDto)
  trigger_type?: EBookletHotspotTriggerDto;

  @IsOptional()
  @IsObject()
  display_behavior?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  content_json?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  interaction_json?: Record<string, unknown>;
}

export class EBookletCheckoutDto {
  @IsOptional()
  @IsInt()
  teacher_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  instance_id?: number;

  @IsInt()
  template_id!: number;

  @IsInt()
  template_version_id!: number;

  @IsObject()
  branding_json!: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marketing_price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  internal_price?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  contact_whatsapp?: string;
}

export class PublicEBookletCheckoutItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  instance_id?: number;

  @IsInt()
  @Min(1)
  template_id!: number;

  @IsInt()
  @Min(1)
  template_version_id!: number;

  @IsOptional()
  @IsArray()
  required_field_values?: Array<{ field_definition_id: number; value: string }>;
}

export class EBookletRepeatPurchaseCheckDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  template_ids!: number[];
}

export class PublicEBookletCheckoutDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  instance_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  template_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  template_version_id?: number;

  @IsOptional()
  @IsArray()
  items?: PublicEBookletCheckoutItemDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  payment_method_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  numberTransferredFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  required_field_values?: Array<{ field_definition_id: number; value: string }>;

  @IsBoolean()
  terms_accepted!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  terms_version?: string;
}

export class UpdateEBookletPurchaseStatusDto {
  @IsEnum(EBookletPurchaseStatusDto)
  status!: EBookletPurchaseStatusDto;

  @IsOptional()
  @IsString()
  admin_notes?: string;
}

export class DeliverEBookletDto {
  @IsInt()
  custom_document_file_id!: number;

  @IsString()
  display_title!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  invite_quota?: number;

  @IsInt()
  page_count!: number;

  @IsOptional()
  @IsArray()
  page_dimensions?: Array<{ width: number; height: number }>;

  @IsOptional()
  @IsDateString()
  access_expires_at?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  student_marketing_price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  internal_price?: number;
}

export class CreateEBookletInviteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  max_uses?: number;

  @IsOptional()
  @IsDateString()
  expires_at?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  passcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  passcode_hint?: string;

  @IsOptional()
  @IsBoolean()
  require_passcode?: boolean;
}

export class UpdateEBookletQuotaDto {
  @IsInt()
  @Min(0)
  invite_quota!: number;
}

export class UpdateEBookletAccessExpiryDto {
  @IsDateString()
  access_expires_at!: string;
}

export class AcceptEBookletInviteDto {
  @IsString()
  token!: string;

  @IsOptional()
  @IsEnum(EBookletInviteAccessPathDto)
  accessPath?: EBookletInviteAccessPathDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  purchaseId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  paymentProofFileId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  payment_method_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  numberTransferredFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  termsVersion?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  passcode?: string;
}

export class EBookletStudentPurchaseLinkDto {
  @IsString()
  token!: string;

  @IsInt()
  @Min(1)
  purchaseId!: number;

  @IsBoolean()
  termsAccepted!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  termsVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  paymentProofFileId?: number;
}

export class EBookletPaymentProofDto {
  @IsInt()
  @Min(1)
  paymentProofFileId!: number;

  @IsOptional()
  @IsString()
  paymentReference?: string;
}

export class EBookletDeviceBindDto {
  @IsString()
  @Length(1, 128)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  deviceFingerprint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;
}

export class EBookletDeviceAllowanceDto {
  @IsInt()
  @Min(1)
  allowedDevices!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ViewerPageRequestDto {
  @IsInt()
  @Min(1)
  page_number!: number;
}

export class EBookletVisibilityDto {
  @IsBoolean()
  visible!: boolean;
}
