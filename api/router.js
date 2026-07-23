import { authRouter } from "./auth-router";
import { localAuthRouter } from "./local-auth-router";
import { inventoryRouter } from "./inventory-router";
import { initDataRouter } from "./init-data-router";
import { createRouter, publicQuery } from "./middleware";
const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  localAuth: localAuthRouter,
  inventory: inventoryRouter,
  initData: initDataRouter
});
export {
  appRouter
};
