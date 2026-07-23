import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";

// Seed default employee (German) on startup
async function seedDefaultEmployee() {
  try {
    const mysql = await import("mysql2/promise");
    const bcrypt = await import("bcryptjs");
    const conn = await mysql.default.createConnection(process.env.DATABASE_URL!);

    const [existing]: any = await conn.execute(
      "SELECT id FROM employees WHERE username = ?",
      ["german"]
    );

    if (existing.length === 0) {
      const hashedPassword = await bcrypt.default.hash("german123", 10);
      await conn.execute(
        "INSERT INTO employees (storeId, username, password, name, role) VALUES (?, ?, ?, ?, ?)",
        [1, "german", hashedPassword, "German", "employee"]
      );
      console.log("[SEED] Employee 'German' created successfully.");
    } else {
      console.log("[SEED] Employee 'German' already exists.");
    }

    await conn.end();
  } catch (err: any) {
    console.log("[SEED] Warning:", err.message);
  }
}

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
// Init data route (must be before catch-all)
const { initRoute } = await import("./init-route.ts");
initRoute(app);

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  const { initDatabase } = await import("./db-init");
  
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Initialize database AFTER server starts (non-blocking)
  initDatabase().catch((err) => {
    console.error("[DB-INIT] Failed:", err.message);
  });

  // Seed default employee (German) on startup
  seedDefaultEmployee();
}
