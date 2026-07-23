import { authRouter } from "./auth-router";
import { localAuthRouter } from "./local-auth-router";
import { inventoryRouter } from "./inventory-router";
import { initDataRouter } from "./init-data-router";
import { labelConfigRouter } from "./routers/labelConfig";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  localAuth: localAuthRouter,
  inventory: inventoryRouter,
  initData: initDataRouter,
  labelConfig: labelConfigRouter,
});

export type AppRouter = typeof appRouter;
