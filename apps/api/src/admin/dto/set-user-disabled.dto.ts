import { IsBoolean } from 'class-validator';

// Deliberately the ONLY field an admin can set on a user row — no name,
// no email, no role change here. "No edit profile" per the build
// instructions for this part; promoting someone to admin still only
// happens directly in the database (see the README's existing note on
// that), not through this endpoint.
export class SetUserDisabledDto {
  @IsBoolean()
  isDisabled!: boolean;
}
