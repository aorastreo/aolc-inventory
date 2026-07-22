import { authenticateRequest } from "./kimi/auth";
export async function createContext(opts) {
    const ctx = { req: opts.req, resHeaders: opts.resHeaders };
    try {
        ctx.user = await authenticateRequest(opts.req.headers);
    }
    catch {
        // Authentication is optional here
    }
    return ctx;
}
