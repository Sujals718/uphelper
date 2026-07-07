// franc@5 (pinned deliberately for CommonJS compatibility — see
// PHASE3_DEPENDENCIES.md) ships no type declarations of its own. Only
// franc v6+ bundles its own types, and v6+ is ESM-only, which is exactly
// what pinning to v5 avoids. `@types/franc` on npm is a deprecated stub
// that just says "not needed, franc has its own types now" — true for
// v6+, not for the version this project actually uses — so installing it
// does not fix this.
//
// Minimal signature covering only what language-detection.service.ts
// actually calls: `franc(text, { minLength })`.
declare module 'franc' {
  export function franc(
    text: string,
    options?: {
      minLength?: number;
      only?: string[];
      ignore?: string[];
    },
  ): string;
}
