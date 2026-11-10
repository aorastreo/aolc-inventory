import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";

// Optional first-run seed. Never invent passwords in production.
async function seedDefaultEmployee() {
  const seedPassword = process.env.EMPLOYEE_SEED_PASSWORD?.trim();
  if (!seedPassword) {
    console.log("[SEED] Skipped (set EMPLOYEE_SEED_PASSWORD only when creating a missing account).");
    return;
  }

  try {
    const mysql = await import("mysql2/promise");
    const bcrypt = await import("bcryptjs");
    const conn = await mysql.default.createConnection(process.env.DATABASE_URL!);
    const username = process.env.EMPLOYEE_SEED_USERNAME?.trim() || "german";
    const name = process.env.EMPLOYEE_SEED_NAME?.trim() || "German";
    const storeId = Number(process.env.EMPLOYEE_SEED_STORE_ID || "1");

    const [existing]: any = await conn.execute(
      "SELECT id FROM employees WHERE username = ?",
      [username],
    );

    if (existing.length === 0) {
      const hashedPassword = await bcrypt.default.hash(seedPassword, 10);
      await conn.execute(
        "INSERT INTO employees (storeId, username, password, name, role) VALUES (?, ?, ?, ?, ?)",
        [storeId, username, hashedPassword, name, "employee"],
      );
      console.log(`[SEED] Employee '${username}' created successfully.`);
    } else {
      console.log(`[SEED] Employee '${username}' already exists.`);
    }

    await conn.end();
  } catch (err: any) {
    console.log("[SEED] Warning:", err.message);
  }
}

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
// Plain health endpoint for Railway (avoid tRPC batch quirks during deploy checks)
app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
// Init data route (must be before catch-all)
const { initRoute } = await import("./init-route.ts");
initRoute(app);

/**
 * Temporary image hosting so Google Lens / reverse image search can fetch the photo.
 * POST JSON { imageBase64, mimeType? } → { id, publicUrl, lensUrl, imagesUrl }
 * GET  /api/lens-image/:id → raw image bytes (short TTL)
 */
app.post("/api/lens-image", async (c) => {
  try {
    const body = await c.req.json();
    const imageBase64 = String(body?.imageBase64 || "");
    const mimeType = String(body?.mimeType || "image/jpeg");
    if (imageBase64.length < 40) return c.json({ error: "Falta imagen" }, 400);

    const { putTempImage, buildPublicImageUrl, buildLensSearchUrls } = await import("./lib/temp-images");
    const id = putTempImage(imageBase64, mimeType);
    const publicUrl = buildPublicImageUrl(c.req.raw, id);
    const urls = buildLensSearchUrls(publicUrl);
    return c.json({ id, publicUrl, lensUrl: urls.lens, imagesUrl: urls.images });
  } catch (err: any) {
    return c.json({ error: err?.message || "Error subiendo imagen" }, 400);
  }
});

app.get("/api/lens-image/:id", async (c) => {
  const { getTempImage } = await import("./lib/temp-images");
  const img = getTempImage(c.req.param("id"));
  if (!img) return c.json({ error: "Imagen expirada o no encontrada" }, 404);
  return new Response(new Uint8Array(img.bytes), {
    status: 200,
    headers: {
      "Content-Type": img.mimeType,
      "Cache-Control": "public, max-age=600",
      // Allow Googlebot / Lens to fetch
      "Access-Control-Allow-Origin": "*",
    },
  });
});

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
  initDatabase()
    .then(async () => {
      const { ensureEnterpriseSchema } = await import("./lib/enterprise-schema");
      await ensureEnterpriseSchema();
    })
    .catch((err) => {
      console.error("[DB-INIT] Failed:", err.message);
    });

  // Seed default employee (German) on startup
  seedDefaultEmployee();
}
