import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

type App = Hono<{ Bindings: HttpBindings }>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function serveStaticFiles(app: App) {
  // Try multiple possible paths for dist/public
  const possiblePaths = [
    path.resolve(__dirname, "../../dist/public"),
    path.resolve(__dirname, "../../../dist/public"),
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(process.cwd(), "public"),
  ];

  let distPath = "";
  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, "index.html"))) {
      distPath = p;
      console.log(`[STATIC] Serving from: ${distPath}`);
      break;
    }
  }

  if (!distPath) {
    console.error("[STATIC] dist/public not found. Searched:");
    possiblePaths.forEach(p => console.error(`  - ${p}`));
    return;
  }

  app.use("*", serveStatic({ root: distPath }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content);
  });
}
