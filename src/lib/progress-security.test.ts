import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/002_server_owned_progress.sql"),
  "utf8",
);
const originalMigration = readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/001_phase3_persistence.sql"),
  "utf8",
);

describe("server-owned progress migration", () => {
  it("revokes browser and public table privileges before granting owner-scoped reads", () => {
    expect(migration).toMatch(/revoke all privileges on table[\s\S]+from public, anon, authenticated/i);
    expect(migration).toMatch(/grant select on table[\s\S]+to authenticated/i);
    expect(migration).toMatch(/grant select, insert, update, delete on table[\s\S]+to service_role/i);
  });

  it("removes the previous learner write policies on trusted progress tables", () => {
    expect(migration).toMatch(/drop policy if exists "Learners can insert only their own attempts"/i);
    expect(migration).toMatch(/drop policy if exists "Learners can update only their own attempts"/i);
    expect(migration).toMatch(/drop policy if exists "Learners can insert only their own completions"/i);
    expect(migration).toMatch(/drop policy if exists "Learners can insert only their own mistake summaries"/i);
    expect(migration).toMatch(/drop policy if exists "Learners can update only their own mistake summaries"/i);
  });

  it("retains the prior owner-scoped read policies for all trusted progress tables", () => {
    expect(originalMigration).toMatch(/on public\.mission_attempts\s+for select using \(auth\.uid\(\) = learner_id\)/i);
    expect(originalMigration).toMatch(/on public\.mission_completions\s+for select using \(auth\.uid\(\) = learner_id\)/i);
    expect(originalMigration).toMatch(/on public\.learner_mistakes\s+for select using \(auth\.uid\(\) = learner_id\)/i);
  });
});
