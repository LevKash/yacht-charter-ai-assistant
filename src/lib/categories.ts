/** Preset knowledge categories shown as chips. Free text is always allowed too. */
export const CATEGORIES = [
  "Kitchen",
  "Fridge",
  "Engine",
  "Anchor",
  "Toilets",
  "BBQ",
  "Water",
  "Power",
  "Safety",
  "Sailing",
  "Local tips",
  "Quirks",
  "General",
] as const;

export type PresetCategory = (typeof CATEGORIES)[number];

/** Map a free-text category from the AI onto a preset when it clearly matches. */
export function normalizeCategory(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  if (!value) return "General";
  const lower = value.toLowerCase();
  for (const preset of CATEGORIES) {
    if (preset.toLowerCase() === lower) return preset;
  }
  const aliases: Record<string, PresetCategory> = {
    galley: "Kitchen",
    cooking: "Kitchen",
    stove: "Kitchen",
    gas: "Kitchen",
    freezer: "Fridge",
    cooling: "Fridge",
    motor: "Engine",
    fuel: "Engine",
    anchoring: "Anchor",
    windlass: "Anchor",
    mooring: "Anchor",
    toilet: "Toilets",
    heads: "Toilets",
    bathroom: "Toilets",
    shower: "Water",
    "water heater": "Water",
    tank: "Water",
    electricity: "Power",
    battery: "Power",
    batteries: "Power",
    inverter: "Power",
    charging: "Power",
    emergency: "Safety",
    "life jackets": "Safety",
    sails: "Sailing",
    navigation: "Sailing",
    dinghy: "Sailing",
    "local tip": "Local tips",
    restaurants: "Local tips",
    marina: "Local tips",
    quirk: "Quirks",
    issues: "Quirks",
    "known issues": "Quirks",
    grill: "BBQ",
    barbecue: "BBQ",
  };
  for (const [alias, preset] of Object.entries(aliases)) {
    if (lower.includes(alias)) return preset;
  }
  return value.slice(0, 40);
}

/** Guess a preset category from free text; returns "General" when nothing matches (never a custom value). */
export function guessCategory(text: string): string {
  const guess = normalizeCategory(text.slice(0, 200));
  return (CATEGORIES as readonly string[]).includes(guess) ? guess : "General";
}
