import { getDb } from "../api/queries/connection";
import { stores } from "./schema";
async function seed() {
    const db = getDb();
    console.log("[Seed] Starting...");
    // Insert 3 stores
    console.log("[Seed] Inserting stores...");
    const storeData = [
        { name: "American Outlet Los Chiles", slug: "los-chiles", description: "Tienda principal en Los Chiles" },
        { name: "American Outlet Pavon", slug: "pavon", description: "Tienda en Pavon" },
        { name: "American Outlet Santa Rosa", slug: "santa-rosa", description: "Tienda en Santa Rosa" },
    ];
    for (const store of storeData) {
        const existing = await db.select().from(stores);
        const found = existing.find(s => s.slug === store.slug);
        if (!found) {
            await db.insert(stores).values(store);
            console.log(`[Seed] Created store: ${store.name}`);
        }
        else {
            console.log(`[Seed] Store already exists: ${store.name}`);
        }
    }
    console.log("[Seed] Done!");
}
seed().catch(console.error);
