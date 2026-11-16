import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  MaxLength,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";

export class PurchaseItemRequiredFieldDto {
  @IsInt()
  @IsPositive()
  field_definition_id: number;

  @IsString()
  @MaxLength(1000)
  value: string;
}

export class CreatePurchaseItemDto {
  @IsInt()
  @IsPositive()
  product_id: number;

  @IsNumber()
  price_at_purchase: number;

  @IsNumber()
  discount: number;

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsNumber()
  final_price: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  coupon_id?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemRequiredFieldDto)
  required_fields?: PurchaseItemRequiredFieldDto[];
}

export class CreatePurchaseDto {
  @IsInt()
  @IsPositive()
  user_id: number;

  @ValidateIf((o: CreatePurchaseDto) => Number(o.total) > 0)
  @IsInt()
  @IsPositive()
  payment_method_id?: number | null;

  @ValidateIf((o: CreatePurchaseDto) => Number(o.total) > 0)
  @IsInt()
  @IsPositive()
  payment_screenshot_id?: number | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items: CreatePurchaseItemDto[];

  @IsNumber()
  subtotal: number;

  @IsNumber()
  discount: number;

  @IsNumber()
  total: number;

  @IsOptional()
  @ValidateIf((o: CreatePurchaseDto) => Number(o.total) > 0)
  @IsString()
  @MaxLength(50)
  number_transferred_from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payment_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class AdminNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  admin_notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  adminNote?: string;
}

export class PurchaseFilterDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minTotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxTotal?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  productId?: number;

  // The customer's current account level.
  @IsOptional()
  @IsString()
  flag?: string;
}
