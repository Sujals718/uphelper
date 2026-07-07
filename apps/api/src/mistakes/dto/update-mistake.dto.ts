import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// Hand-written rather than `PartialType(CreateMistakeDto)` — @nestjs/mapped-types
// isn't in package.json yet, and pulling it in for one small DTO isn't worth
// a new dependency. Every field is optional; the service only writes the
// keys that are actually present (see MistakesService.update).
export class UpdateMistakeDto {
  @IsOptional()
  @IsUUID()
  problemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
