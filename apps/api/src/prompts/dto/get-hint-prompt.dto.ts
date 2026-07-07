import { IsOptional, IsString, MinLength } from 'class-validator';

// GET /prompts/hint?problemName=...&platform=...&contestName=...&problemStatement=...
// A query-param DTO, same convention as videos/dto/search-videos.dto.ts —
// relies on main.ts's global ValidationPipe({ transform: true }).

export class GetHintPromptDto {
  @IsString()
  @MinLength(1)
  problemName!: string;

  @IsString()
  @MinLength(1)
  platform!: string;

  @IsString()
  @MinLength(1)
  contestName!: string;

  @IsOptional()
  @IsString()
  problemStatement?: string;
}
