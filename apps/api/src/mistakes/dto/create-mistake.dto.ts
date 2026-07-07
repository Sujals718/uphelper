import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMistakeDto {
  // Nullable in the schema — a mistake can stand on its own ("forgot to
  // flush stdout again") without being tied to a specific Problem row,
  // since not every mistake happens during one particular problem attempt.
  @IsOptional()
  @IsUUID()
  problemId?: string;

  @IsString()
  @MaxLength(4000)
  note!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
