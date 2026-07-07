import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateRevisionItemDto {
  // Optional for the same reason as Mistake.problemId — a revision item
  // like "graph shortest-path variants" might not map to one specific
  // Problem row, so problemName carries the free-text label independently.
  @IsOptional()
  @IsUUID()
  problemId?: string;

  @IsString()
  @MaxLength(300)
  problemName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  selfHint?: string;

  // ISO 8601 string from the client; stored as TIMESTAMPTZ. Optional — a
  // user can add an item without picking a reminder time, relying on
  // SM-2's own next_review_at (seeded to tomorrow) once they review it.
  @IsOptional()
  @IsDateString()
  reminderAt?: string;
}
