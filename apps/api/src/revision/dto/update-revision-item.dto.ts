import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const STATUSES = ['pending', 'done', 'snoozed'] as const;
type Status = (typeof STATUSES)[number];

export class UpdateRevisionItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  problemName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  selfHint?: string;

  @IsOptional()
  @IsDateString()
  reminderAt?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: Status;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  grade?: number;

  //  Undo support
  //
  // These four fields exist purely so a client can restore a *previous*
  // SM-2 state verbatim — the "undo my last review" case. They're
  // deliberately separate from `grade`: grade always goes through
  // calculateSm2() and produces a *new* forward state; these bypass the
  // algorithm entirely and just write back exact values the client
  // already had (it fetched them from this same API a moment earlier,
  // before the review it now wants to undo).
  //
  // This is a narrow, ownership-gated escape hatch, not a general "set
  // your own spaced-repetition state to anything" feature — it's
  // validated as all-or-nothing (see RevisionService.update) and mutually
  // exclusive with `grade` in the same request, so there's no ambiguity
  // about which code path decided the resulting state.
  @IsOptional()
  @IsInt()
  @Min(0)
  sm2Repetition?: number;

  @IsOptional()
  @IsNumber()
  @Min(1.3)
  sm2EaseFactor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sm2IntervalDays?: number;

  // Distinct from `reminderAt` above — reminderAt is a user-set reminder,
  // this is the SM-2-derived schedule date being restored directly.
  @IsOptional()
  @IsDateString()
  nextReviewAt?: string;
}
