
const LANGUAGE_NAMES: Record<string, string> = {
  // ISO 639-1 (the common case — see ISO_639_3_TO_1 in the backend, plus
  // whatever `defaultAudioLanguage` metadata hands back directly as a
  // 2-letter BCP-47 base code, e.g. "ru", "ja", "es" — that path is NOT
  // run through the backend's 639-3 -> 639-1 map, so it can surface
  // 2-letter codes for languages outside that map too).
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  ur: "Urdu",
  kn: "Kannada",
  gu: "Gujarati",
  ml: "Malayalam",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  vi: "Vietnamese",
  id: "Indonesian",
  ar: "Arabic",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  es: "Spanish",
  zh: "Mandarin Chinese",
  pa: "Punjabi",
  or: "Odia",
  as: "Assamese",
  pan: "Punjabi",
  ori: "Odia",
  asm: "Assamese",
  spa: "Spanish",
  por: "Portuguese",
  rus: "Russian",
  cmn: "Mandarin Chinese",
  jpn: "Japanese",
  kor: "Korean",
  vie: "Vietnamese",
  ind: "Indonesian",
  ara: "Arabic",
  fra: "French",
  deu: "German",
  sco: "Likely Misdetected",
  und: "Uncertain",
};

export function languageDisplayName(code: string | null | undefined): string {
  if (!code) return "Uncertain language";
  const normalized = code.toLowerCase();
  return LANGUAGE_NAMES[normalized] ?? code;
}