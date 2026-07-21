import { authRouter } from "./auth-router";
import { inventoryRouter } from "./inventory-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  inventory: inventoryRouter,
});

export type AppRouter = typeof appRouter;
