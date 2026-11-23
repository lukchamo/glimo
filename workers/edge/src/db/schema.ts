// D1 schema (Drizzle ORM). D1 holds what is shared and public or purely operational:
// the skills catalog, an index of vitrinas, and the audit log of decisions.
// It never holds what an agent sees or thinks.

import type { GlimState } from '@glimo/spec';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Public catalog of skills (Agent Skills format, SKILL.md). */
export const skills = sqliteTable(
  'skills',
  {
    slug: text('slug').primaryKey(),
    name: text('name').notNull(),
    nameEs: text('name_es').notNull(),
    summary: text('summary').notNull(),
    summaryEs: text('summary_es').notNull(),
    needs: text('needs').notNull(),
    needsEs: text('needs_es').notNull(),
    icon: text('icon').notNull(),
    category: text('category').notNull(),
    /** States this skill can put a glim in (what the person should expect to see). */
    states: text('states', { mode: 'json' }).$type<GlimState[]>().notNull(),
    /** Path of the skill inside the repository. */
    path: text('path').notNull(),
    position: integer('position').notNull().default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('skills_position_idx').on(table.position)],
);

/** Bookkeeping only: which vitrinas exist. Their content lives in their Durable Object. */
export const vitrinas = sqliteTable('vitrinas', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Every decision a person takes from a vitrina is recorded: what, on which agent, when. */
export const actionLog = sqliteTable(
  'action_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vitrinaId: text('vitrina_id').notNull(),
    agentId: text('agent_id').notNull(),
    actionId: text('action_id').notNull(),
    label: text('label').notNull(),
    sensitive: integer('sensitive', { mode: 'boolean' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('action_log_vitrina_idx').on(table.vitrinaId, table.createdAt)],
);

export type Skill = typeof skills.$inferSelect;
export type ActionLogEntry = typeof actionLog.$inferSelect;
