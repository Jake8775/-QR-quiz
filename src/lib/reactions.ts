import { z } from "zod";

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "👏", "🔥"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const reactionEmojiSchema = z.enum(REACTION_EMOJIS);
