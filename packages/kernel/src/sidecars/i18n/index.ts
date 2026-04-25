/**
 * i18n.ts — Internationalization sidecar
 *
 * Lightweight i18n for Meow CLI. Three locales: en, zh, zt.
 * Language preference persists in .agent-kernel/config.json.
 *
 * Usage:
 *   import { t, setLocale, getLocale } from "../sidecars/i18n/index.ts";
 *   console.log(t("prompt"));  // → "🐱 meow > " (or translated version)
 *   setLocale("zh");
 *
 * Slash command: /lang en|zh|zt
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { translations, localeNames, type Locale, type TranslationKey } from "./translations.ts";

// ============================================================================
// Config file
// ============================================================================

const MEOW_DIR = join(homedir(), ".meow");
const CONFIG_FILE = join(MEOW_DIR, "config.json");

interface MeowConfig {
  locale?: Locale;
  [key: string]: unknown;
}

function ensureMeowDir(): void {
  if (!existsSync(MEOW_DIR)) {
    mkdirSync(MEOW_DIR, { recursive: true });
  }
}

function loadConfig(): MeowConfig {
  ensureMeowDir();
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(config: MeowConfig): void {
  ensureMeowDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ============================================================================
// Locale state
// ============================================================================

let currentLocale: Locale = "en";

function detectSystemLocale(): Locale {
  const lang = (process.env.LANG || process.env.LC_ALL || "").toLowerCase();
  if (lang.startsWith("zh_tw") || lang.startsWith("zh-hant")) return "zt";
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

// Load persisted locale on init
export function initI18n(): void {
  const config = loadConfig();
  if (config.locale && (config.locale === "en" || config.locale === "zh" || config.locale === "zt")) {
    currentLocale = config.locale;
  } else {
    currentLocale = detectSystemLocale();
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: string): { success: boolean; locale: Locale; error?: string } {
  if (locale === "en" || locale === "zh" || locale === "zt") {
    currentLocale = locale;
    const config = loadConfig();
    config.locale = locale;
    saveConfig(config);
    return { success: true, locale };
  }
  return { success: false, locale: currentLocale, error: `Unknown locale: ${locale}` };
}

export function getLocaleName(locale?: Locale): string {
  return localeNames[locale || currentLocale];
}

// ============================================================================
// Translate
// ============================================================================

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const locale = translations[currentLocale];
  const fallback = translations.en;
  let text = (locale[key] as string) || (fallback[key] as string) || key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

// ============================================================================
// /lang slash command
// ============================================================================

export async function langCommand(args: string): Promise<{ content: string; handled: boolean }> {
  const lang = args.trim().toLowerCase();

  if (!lang || lang === "current") {
    return {
      content: t("lang_current", { lang: getLocaleName() }),
      handled: true,
    };
  }

  if (lang === "list" || lang === "help") {
    const lines = (["en", "zh", "zt"] as Locale[])
      .map((l) => `  ${l === currentLocale ? "●" : "○"} ${l} — ${localeNames[l]}`)
      .join("\n");
    return {
      content: `${t("lang_current", { lang: getLocaleName() })}\n${lines}\n\n${t("lang_help")}`,
      handled: true,
    };
  }

  const result = setLocale(lang);
  if (result.success) {
    return {
      content: t("lang_changed", { lang: getLocaleName(result.locale) }),
      handled: true,
    };
  }

  const available = Object.keys(localeNames).join(", ");
  return {
    content: t("lang_unknown", { lang }) + ` (${available})`,
    handled: true,
  };
}

