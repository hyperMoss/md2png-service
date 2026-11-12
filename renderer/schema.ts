import { z } from 'zod';
export const themes = ['default','smartisan-dark','apple-notes','apple-notes-light','bear','bazhahei','telegraph'] as const;
export const renderSchema = z.object({ markdown: z.string().min(1).max(1_000_000), theme: z.enum(themes).default('default'), footer: z.object({brand:z.string().max(80).default(''), via:z.string().max(80).default('')}).strict().default({brand:'',via:''}) }).strict();
export type RenderInput = z.infer<typeof renderSchema>;
