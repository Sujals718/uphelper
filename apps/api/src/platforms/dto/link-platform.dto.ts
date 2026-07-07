import { IsString, Matches } from 'class-validator';

export class LinkPlatformDto {
  // Codeforces handles are alphanumeric plus underscore/dot/hyphen. This
  // isn't a security boundary (verifyHandle() against the real API is what
  // actually confirms it exists) — it's just a cheap reject for obviously
  // malformed input before spending an outbound API call on it.
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{1,64}$/, {
    message: 'handle must look like a Codeforces handle (letters, numbers, _ . -, max 64 chars)',
  })
  handle!: string;
}
