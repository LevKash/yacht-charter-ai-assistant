/**
 * Central place to read environment configuration. Every optional integration
 * has an `is…Configured` helper so screens can degrade gracefully.
 */
export const env = {
  openrouterKey: process.env.OPENROUTER_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL || "deepseek/deepseek-chat",
  sttKey: process.env.STT_API_KEY ?? "",
  sttBaseUrl: (process.env.STT_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
  sttModel: process.env.STT_MODEL || "whisper-1",
  whatsappToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  whatsappBotName: process.env.WHATSAPP_BOT_DISPLAY_NAME || "assistant",
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
};

export const isLlmConfigured = () => Boolean(env.openrouterKey);
export const isSttConfigured = () => Boolean(env.sttKey);
export const isWhatsappConfigured = () =>
  Boolean(env.whatsappToken && env.whatsappPhoneId && env.whatsappVerifyToken);
