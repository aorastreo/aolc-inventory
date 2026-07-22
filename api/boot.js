import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
const app = new Hono();
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
}
