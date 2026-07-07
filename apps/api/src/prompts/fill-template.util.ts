
// The build spec is explicit and narrow about what this is allowed to do:
// "return the filled template text — verbatim, with correct placeholder
// substitution, nothing else added or reworded." That rules out anything
// that reads like "helpful" post-processing — no trimming blank lines,
// no re-wrapping text, no re-casing. This function's only job is find
// "{key}" and swap in a string.

export type TemplatePlaceholders = Record<string, string>;


export function fillTemplate(body: string, placeholders: TemplatePlaceholders): string {
  return body.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(placeholders, key)) {
      return match;
    }
    return placeholders[key];
  });
}
