import { existsSync } from "fs";
import { spawnSync } from "child_process";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

// Build frontend if needed
if (!existsSync("dist/public/index.html")) {
  console.log("[prestart] dist/public/index.html not found, running build...");
  const result = spawnSync("npm", ["run", "build"], { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status || 1);
} else {
  console.log("[prestart] dist/public/index.html exists, skipping build.");
}

// Push database schema (creates new tables like printedLabels)
console.log("[prestart] Pushing database schema...");
const dbResult = spawnSync("npx", ["drizzle-kit", "push", "--force"], { stdio: "inherit", shell: true });
if (dbResult.status !== 0) {
  console.log("[prestart] db:push had issues (tables may already exist), continuing...");
}

// Seed default employees
console.log("[prestart] Seeding default employees...");
try {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Check if German exists
  const [existing] = await conn.execute("SELECT id FROM employees WHERE username = ?", ["german"]);
  if (existing.length === 0) {
    const hashedPassword = await bcrypt.hash("german123", 10);
    await conn.execute(
      "INSERT INTO employees (storeId, username, password, name, role) VALUES (?, ?, ?, ?, ?)",
      [1, "german", hashedPassword, "German", "employee"]
    );
    console.log("[prestart] Employee 'German' created successfully.");
  } else {
    console.log("[prestart] Employee 'German' already exists.");
  }

  await conn.end();
} catch (err) {
  console.log("[prestart] Seed warning:", err.message);
}

console.log("[prestart] Done.");
