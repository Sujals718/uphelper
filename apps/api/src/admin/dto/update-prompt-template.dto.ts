import { IsIn, IsString, MinLength } from 'class-validator';
const PROMPT_TEMPLATE_TYPES = ['hint', 'debug'] as const;

// PATCH /admin/prompt-templates — body, not a :type path param, so the
// whole request can be validated by a single class-validator DTO (same
// pattern as SetUserDisabledDto) rather than a manual check in the
// controller. "Update" here always means "create a new version and make
// it active" (see AdminService.updateActivePromptTemplate) — never an
// in-place overwrite of the existing row, per the build spec's versioning
// requirement.
export class UpdatePromptTemplateDto {
  @IsIn(PROMPT_TEMPLATE_TYPES)
  type!: 'hint' | 'debug';

  @IsString()
  @MinLength(1)
  body!: string;
}
