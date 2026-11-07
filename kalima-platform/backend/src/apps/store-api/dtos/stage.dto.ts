import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsInt,
  Min,
} from "class-validator";

export class CreateStageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title_ar: string;

  @IsInt()
  @Min(1)
  sort_order: number;
}

export class UpdateStageDto {
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
  @Min(1)
  sort_order?: number;
}
