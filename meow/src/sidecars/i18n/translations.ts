/**
 * translations.ts — UI strings for Meow CLI
 *
 * Three languages: English (en), 简体中文 (zh), 繁體中文 (zt)
 * Extend by adding entries to each locale's record.
 */

export type Locale = "en" | "zh" | "zt";

export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "简体中文",
  zt: "繁體中文",
};

type TranslationKey = keyof typeof translations.en;

export const translations = {
  en: {
    // CLI prompt
    prompt: "🐱 meow > ",

    // Errors
    err_interrupt: "Interrupted",
    err_session_save: "Failed to save session",
    err_compact: "Session compaction failed",

    // Status messages
    compacting: "Session getting long — compacting...",
    compacted: "✓ Compacted {old} messages → {new}",
    tokens_cost: "tokens · ~",

    // Slash commands help
    help_intro: "Available commands:",
    help_command: "/{name}   {description}",

    // Session
    session_saved: "Session saved",
    session_resumed: "Resumed session {id}",

    // Tool loading
    tools_loaded: "Loaded {n} tools and {m} skills",

    // Language
    lang_current: "Language: {lang}",
    lang_changed: "Language changed to {lang}",
    lang_unknown: "Unknown locale: {lang}. Available: en, zh, zt",
    lang_help: "/lang [en|zh|zt] — switch language",

    // Abort
    interrupted: "⏹️ Interrupted",

    // Misc
    thinking: "thinking...",
    goodbye: "Goodbye!",
    plan_mode: "Plan mode — shows intent before executing",
    clear: "Screen cleared",
  },

  zh: {
    // CLI prompt
    prompt: "🐱 meow > ",

    // Errors
    err_interrupt: "已中断",
    err_session_save: "保存会话失败",
    err_compact: "会话压缩失败",

    // Status messages
    compacting: "会话较长 — 正在压缩...",
    compacted: "✓ 压缩 {old} 条消息 → {new} 条",
    tokens_cost: "tokens · ~",

    // Slash commands help
    help_intro: "可用命令：",
    help_command: "/{name}   {description}",

    // Session
    session_saved: "会话已保存",
    session_resumed: "已恢复会话 {id}",

    // Tool loading
    tools_loaded: "已加载 {n} 个工具和 {m} 个技能",

    // Language
    lang_current: "当前语言：{lang}",
    lang_changed: "语言已切换为 {lang}",
    lang_unknown: "未知语言：{lang}。可用：en, zh, zt",
    lang_help: "/lang [en|zh|zt] — 切换语言",

    // Abort
    interrupted: "⏹️ 已中断",

    // Misc
    thinking: "思考中...",
    goodbye: "再见！",
    plan_mode: "计划模式 — 执行前显示意图",
    clear: "屏幕已清空",
  },

  zt: {
    // CLI prompt
    prompt: "🐱 meow > ",

    // Errors
    err_interrupt: "已中斷",
    err_session_save: "儲存會話失敗",
    err_compact: "會話壓縮失敗",

    // Status messages
    compacting: "會話較長 — 正在壓縮...",
    compacted: "✓ 壓縮 {old} 條消息 → {new} 條",
    tokens_cost: "tokens · ~",

    // Slash commands help
    help_intro: "可用命令：",
    help_command: "/{name}   {description}",

    // Session
    session_saved: "會話已儲存",
    session_resumed: "已恢復會話 {id}",

    // Tool loading
    tools_loaded: "已載入 {n} 個工具和 {m} 個技能",

    // Language
    lang_current: "當前語言：{lang}",
    lang_changed: "語言已切換為 {lang}",
    lang_unknown: "未知語言：{lang}。可用：en, zh, zt",
    lang_help: "/lang [en|zh|zt] — 切換語言",

    // Abort
    interrupted: "⏹️ 已中斷",

    // Misc
    thinking: "思考中...",
    goodbye: "再見！",
    plan_mode: "計劃模式 — 執行前顯示意圖",
    clear: "螢幕已清空",
  },
} as const;

// Type-check all locales have the same keys
type _CheckKeys = TranslationKey;
