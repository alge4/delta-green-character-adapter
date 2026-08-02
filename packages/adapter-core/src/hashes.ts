import * as z from "zod";

export const contentHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export function isContentHash(value: string): boolean {
  return contentHashSchema.safeParse(value).success;
}
