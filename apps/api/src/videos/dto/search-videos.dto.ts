import { IsString, MinLength } from 'class-validator';

// GET /videos/search?problemName=...&platform=...&contestName=...
// A query-param DTO (not a body DTO) — relies on main.ts's global
// ValidationPipe({ transform: true }) to coerce query strings onto this
// class the same way :platform params already work in PlatformsController.
export class SearchVideosDto {
  @IsString()
  @MinLength(1)
  problemName!: string;

  @IsString()
  @MinLength(1)
  platform!: string;

  @IsString()
  @MinLength(1)
  contestName!: string;

  // e.g. "A", "1002A" — required for the primary query, which is exactly
  // "{contest_name} {problem_code} {problem_name}" per the build spec.
  // A prior version of this DTO omitted this field entirely; that was a
  // bug, not a deliberate simplification.
  @IsString()
  @MinLength(1)
  problemCode!: string;
}
