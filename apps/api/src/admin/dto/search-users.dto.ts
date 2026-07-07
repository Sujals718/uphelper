import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Query params for GET /admin/users. All optional — an admin can just
// hit the endpoint with no query at all and get page 1 of everyone.
// Pagination is included (not skipped) because it was "very easy" here:
// Prisma's skip/take + a parallel count() is a few lines, and
// AdminUsersResponse in shared-types already commits to a
// { users, total, page, pageSize } shape, so leaving pagination out
// would mean building a response type that doesn't match what's used.
export class SearchUsersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  // Capped at 100 — this is a lightweight ops dashboard, not a bulk data
  // export tool. No one legitimately needs 10,000 rows in one response.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
