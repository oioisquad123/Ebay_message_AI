import { z } from "zod";

/**
 * Per PRD §14.1 / §14.5. V1 ships 3 presets only.
 * Custom voice is V1.5.
 */
export const BrandVoicePresetEnum = z.enum([
  "friendly",
  "professional",
  "casual",
]);
export type BrandVoicePreset = z.infer<typeof BrandVoicePresetEnum>;
