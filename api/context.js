import { authenticateRequest } from "./kimi/auth";
async function createContext(opts) {
  const ctx = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
  }
  return ctx;
}
export {
  createContext
};
