
export function cleanContestNameForSearch(rawName: string): string {
  return rawName
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}

// ProblemSummary.externalId is stored as "{contestId}{index}", e.g.
// "1002A" or "1002C1" (Codeforces uses a trailing digit like C1/C2 for
// split problems). For search/query purposes we only ever want the index
// part — "A" or "C1" — not the contest id glued onto the front of it, so
// strip the leading run of digits.
export function extractProblemCode(externalId: string): string {
  return externalId.replace(/^\d+/, "").trim();
}
