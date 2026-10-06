import { z } from 'zod';
export const quadrantIds = ['important-not-urgent', 'important-urgent', 'not-important-not-urgent', 'urgent-not-important'] as const;
export const contentSchema = z.object({
  tasks: z.array(z.object({ id:z.string().max(200), text:z.string().max(200000), completed:z.boolean(), createdAt:z.string().max(100), updatedAt:z.string().max(100), quadrant:z.enum(quadrantIds) }).strict()).max(10000),
  dailyMemos: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.object({morning:z.string().max(200000), afternoon:z.string().max(200000), evening:z.string().max(200000), updatedAt:z.string().max(100)}).strict()),
}).strict();
export type PlanContent = z.infer<typeof contentSchema>;
export const responseSchema = z.object({content:contentSchema,updatedAt:z.number()});
export const uploadSchema = z.object({viewToken:z.string().regex(/^[a-f0-9]{64}$/),content:contentSchema}).strict();
export const tokenSchema=z.string().regex(/^[a-f0-9]{64}$/);
export const sharingSchema=z.object({viewToken:tokenSchema,editingEnabled:z.boolean()}).strict();
export const syncRequestSchema=z.object({base:contentSchema,content:contentSchema,clientId:z.string().regex(/^[a-zA-Z0-9-]{8,80}$/),requestId:z.string().regex(/^[a-zA-Z0-9-]{8,80}$/),actor:z.string().trim().min(1).max(40)}).strict();
export async function hashToken(token:string) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function equalToken(a:string,b:string) {
  if(a.length!==b.length) return false;
  let difference=0; for(let i=0;i<a.length;i++) difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
}
