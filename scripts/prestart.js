import { existsSync } from "fs";
import { spawnSync } from "child_process";

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

console.log("[prestart] Done.");
