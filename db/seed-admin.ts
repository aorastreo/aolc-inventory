import { getDb } from "../api/queries/connection";
import { employees } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seedAdmin() {
  const db = getDb();
  console.log("[Seed] Creating admin user...");

  // Check if admin exists
  const existing = await db.select().from(employees)
    .where(eq(employees.username, "admin"));

  if (existing.length === 0) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    
    await db.insert(employees).values({
      storeId: 1,
      username: "admin",
      password: hashedPassword,
      name: "Administrador",
      role: "admin",
    });

    console.log("[Seed] Admin user created!");
    console.log("  Username: admin");
    console.log("  Password: admin123");
    console.log("  IMPORTANTE: Cambia la contraseña despues del primer login!");
  } else {
    console.log("[Seed] Admin user already exists.");
  }
}

seedAdmin().catch(console.error);
