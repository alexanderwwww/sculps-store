/**
 * One-off backfill for the admin.
 *
 * Store one was seeded before themes and users existed. This gives it a live
 * theme, attaches its existing pages to that theme, and creates the single
 * admin user. Safe to run more than once — every step checks first.
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, isNull, and } from "drizzle-orm";
import * as schema from "../app/db/schema";

const { stores, pages, themes, users } = schema;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "getsculps@gmail.com";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const db = drizzle(neon(url), { schema });

  console.log("Backfilling admin tables…");

  // 1. The admin user. Google sign-in checks this table and never creates rows.
  const [existingUser] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (existingUser) {
    console.log(`  user: ${ADMIN_EMAIL} already exists`);
  } else {
    await db.insert(users).values({ email: ADMIN_EMAIL, name: "Alex" });
    console.log(`  user: created ${ADMIN_EMAIL}`);
  }

  // 2. A live theme per store, and its pages attached to it.
  const allStores = await db.select().from(stores);
  for (const store of allStores) {
    let [live] = await db
      .select()
      .from(themes)
      .where(and(eq(themes.storeId, store.id), eq(themes.isLive, true)))
      .limit(1);

    if (!live) {
      [live] = await db
        .insert(themes)
        .values({ storeId: store.id, name: "Live theme", isLive: true })
        .returning();
      console.log(`  theme: created "Live theme" for ${store.name}`);
    } else {
      console.log(`  theme: ${store.name} already has "${live.name}"`);
    }

    const orphaned = await db
      .select()
      .from(pages)
      .where(and(eq(pages.storeId, store.id), isNull(pages.themeId)));

    if (orphaned.length) {
      await db
        .update(pages)
        .set({ themeId: live.id })
        .where(and(eq(pages.storeId, store.id), isNull(pages.themeId)));
      console.log(`  pages: attached ${orphaned.length} to the live theme`);
    } else {
      console.log(`  pages: nothing to attach for ${store.name}`);
    }
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
