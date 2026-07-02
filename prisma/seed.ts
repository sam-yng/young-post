import { fileURLToPath } from "node:url";
import { db } from "../lib/db";

// Design spec §9: fifteen tags; per-user defaults seeded on first sign-in
// (M2) and editable on /preferences.
export const DEFAULT_TAG_WEIGHTS: Record<string, number> = {
  "agentic-development": 2,
  "harness-engineering": 2,
  mcp: 1.5,
  anthropic: 1.5,
  "rag-retrieval": 1,
  "local-ai": 1,
  "ai-coding-tools": 0,
  "frontend-development": 0,
  nextjs: 0,
  typescript: 0,
  "postgres-supabase": 0,
  "dev-tooling": 0,
  "testing-quality": 0,
  "trending-repos": 0,
  "new-tech": 0,
};

export async function seedTagWeights(userId: string): Promise<void> {
  await db.tagWeight.createMany({
    data: Object.entries(DEFAULT_TAG_WEIGHTS).map(([tag, weight]) => ({
      userId,
      tag,
      weight,
    })),
    skipDuplicates: true,
  });
}

// `prisma db seed` (or running this file directly) seeds a dev user with the
// default weights for local testing.
async function main() {
  const dev = await db.user.upsert({
    where: { email: "dev@young-post.local" },
    update: {},
    create: { email: "dev@young-post.local", name: "Dev User" },
  });
  await seedTagWeights(dev.id);
  console.log(`Seeded dev user ${dev.id} with default tag weights.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
