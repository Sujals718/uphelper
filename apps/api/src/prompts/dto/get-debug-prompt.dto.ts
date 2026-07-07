import { IsString, MinLength } from 'class-validator';

// POST /prompts/debug — a body DTO, not query params, unlike GetHintPromptDto.
// This asymmetry is deliberate and comes straight from the build spec's
// API surface (`GET /prompts/hint` vs `POST /prompts/debug`):
// user_code can be arbitrarily long/multi-line, which is a poor fit for a
// URL query string, whereas the hint endpoint's fields are all short,
// single-line values.
export class GetDebugPromptDto {
  @IsString()
  @MinLength(1)
  problemName!: string;

  @IsString()
  @MinLength(1)
  platform!: string;

  @IsString()
  @MinLength(1)
  contestName!: string;

  @IsString()
  @MinLength(1)
  userCode!: string;
}
