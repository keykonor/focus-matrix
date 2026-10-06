import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const sharedPlans = sqliteTable('shared_plans', {id:text('id').primaryKey(),content:text('content').notNull(),viewTokenHash:text('view_token_hash').notNull(),updatedAt:integer('updated_at').notNull()});
