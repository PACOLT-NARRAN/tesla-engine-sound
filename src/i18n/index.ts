import { cs } from './cs.ts';
import { en, type MessageKey } from './en.ts';

export type { MessageKey } from './en.ts';
export type Language = 'en' | 'cs';
export type Params = Readonly<Record<string, string | number>>;

const DICTIONARIES: Readonly<Record<Language, Readonly<Record<MessageKey, string>>>> = { en, cs };

/** BCP-47 locale used for number formatting. */
const NUMBER_LOCALE: Readonly<Record<Language, string>> = { en: 'en-US', cs: 'cs-CZ' };

export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(en, key);
}

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** Looks the key up in `lang`, falling back to English (and warning in development). */
export function translate(lang: Language, key: MessageKey, params?: Params): string {
  const own = DICTIONARIES[lang][key];
  if (own === undefined || own === '') {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing ${lang} text for "${key}"`);
    return interpolate(en[key], params);
  }
  return interpolate(own, params);
}

/** First supported language among the browser's preferred ones, else English. */
export function detectLanguage(preferred: readonly string[] | undefined): Language {
  for (const tag of preferred ?? []) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'cs' || base === 'sk') return 'cs';
    if (base === 'en') return 'en';
  }
  return 'en';
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Cached per language and precision — cheap enough for the HUD's per-frame RPM readout. */
export function formatNumber(lang: Language, value: number, maximumFractionDigits = 0, minimumFractionDigits = 0): string {
  const key = `${lang}|${maximumFractionDigits}|${minimumFractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(NUMBER_LOCALE[lang], { maximumFractionDigits, minimumFractionDigits });
    formatters.set(key, f);
  }
  return f.format(value);
}

export interface Translator {
  (key: MessageKey, params?: Params): string;
  readonly lang: Language;
  /** Translate a key built at runtime (e.g. from a data id); null when no such key exists. */
  dyn(key: string, params?: Params): string | null;
  num(value: number, maximumFractionDigits?: number, minimumFractionDigits?: number): string;
}

const cache = new Map<Language, Translator>();

/** Stable translator per language (safe to use as a React dependency). */
export function translator(lang: Language): Translator {
  const hit = cache.get(lang);
  if (hit) return hit;
  const t = ((key: MessageKey, params?: Params) => translate(lang, key, params)) as Translator;
  Object.assign(t, {
    lang,
    dyn: (key: string, params?: Params) => (isMessageKey(key) ? translate(lang, key, params) : null),
    num: (value: number, digits = 0, minDigits = 0) => formatNumber(lang, value, digits, minDigits),
  });
  cache.set(lang, t);
  return t;
}
