import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsBoolean,
  IsInt,
  Min,
} from "class-validator";

export class CreateLevelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title_ar: string;

  @IsInt()
  stage_id: number;

  @IsInt()
  @Min(1)
  sort_order: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateLevelDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title_ar?: string;

  @IsOptional()
  @IsInt()
  stage_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
