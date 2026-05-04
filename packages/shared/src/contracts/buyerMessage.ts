import { z } from "zod";

/**
 * Per PRD §19 messages. V0 captures the minimum; V1 adds dedupe_hash, RLS,
 * encryption, etc. Note: `userId` is included from D1 even in V0 (hardcoded
 * to a constant) so the contract survives V0→V1 graduation unchanged.
 */
export const BuyerMessageSchema = z.object({
  userId: z.string(),
  buyerUsername: z.string(),
  body: z.string().min(1).max(20_000),
  ebayItemId: z.string().optional(),
  ebayMessageId: z.string().optional(),
  threadId: z.string().optional(),
  receivedAt: z.string().datetime().optional(),
});
export type BuyerMessage = z.infer<typeof BuyerMessageSchema>;
