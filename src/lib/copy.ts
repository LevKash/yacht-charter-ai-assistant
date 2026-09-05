/**
 * All user-facing UI copy lives here (English). Kept as a plain object so a
 * future language switch only needs to swap this file.
 */
export const copy = {
  brand: "Bax Yachting",
  guest: {
    welcome: (boat: string) =>
      `Hi! I'm the assistant for ${boat}. Ask me anything about the boat — how things work, where things are, what to watch out for. ⛵`,
    placeholder: "Ask about the boat…",
    suggestions: ["How does the fridge work?", "Safety instructions", "Boat quirks", "Where is the BBQ?"],
    footer: "Bax Yachting — AI assistant",
    error: "Sorry, I couldn't answer right now. Please try again in a moment.",
    notFoundTitle: "Boat not found",
    notFoundBody: "This link doesn't match any boat in our fleet. Please check the QR code or ask the crew.",
  },
  assistant: {
    noInfo: (boat: string, contact: string) =>
      `I don't have that info yet — I'm still learning about ${boat}. ${contact}`.trim(),
  },
  admin: {
    nav: { boats: "Boats", import: "Import", settings: "Settings", signOut: "Sign out" },
    boatsEmptyTitle: "No boats yet",
    boatsEmptyBody: "Add your first boat to start building its knowledge. Or create the demo yacht to see how everything works.",
    knowledgeEmptyTitle: "This boat has no knowledge yet",
    knowledgeEmptySteps: [
      "Add a card by hand — e.g. \"How to open the fridge\".",
      "Or import: paste a long text, upload a voice note, or upload a WhatsApp chat export.",
      "Review what the AI proposes, fix anything, then save. Only saved cards are used for answers.",
    ],
    importProcessing: "Analyzing your text… this takes a few seconds.",
    importVoiceDisabled: "Voice import will be available after setup (add an STT key in your environment).",
    aiDisabled: "AI is not connected yet. Add OPENROUTER_API_KEY to enable smart answers and imports. Until then the assistant answers with matching cards and imports are split by paragraph.",
  },
  whatsapp: {
    unbound: "Hi! I'm the boat assistant. Reply with !bind <boat> to connect me to this boat (e.g. !bind lamela).",
    bound: (boat: string) => `Connected to ${boat}. Mention me or use !ask <question> and I'll help. ⛵`,
    unknownBoat: (slug: string) => `I don't know a boat called "${slug}". Check the spelling or ask the office for the boat's short name.`,
    unbound_ok: "Disconnected from this boat. Use !bind <boat> to reconnect.",
    off: "Okay, I'll stay quiet in this group. Send !on to wake me up.",
    on: "I'm back! Mention me or use !ask <question>.",
    status: (boat: string | null, active: boolean) =>
      boat ? `Connected to ${boat}. Assistant is ${active ? "on" : "off"}.` : "Not connected to any boat yet. Use !bind <boat>.",
  },
} as const;
