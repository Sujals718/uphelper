import { IsOptional, IsString } from 'class-validator';

export class FlagLanguageDto {
  // Optional on purpose — a user may just know the detected language is
  // wrong without knowing the ISO code for what it should be. Per the
  // build spec, there's no independent audio-based cross-check anymore,
  // so this endpoint's job is to make the flag VISIBLE for manual review,
  // not to silently "fix" the language itself.
  @IsOptional()
  @IsString()
  correctedLanguage?: string;
}
