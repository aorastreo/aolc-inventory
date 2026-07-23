import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
const t = initTRPC.context().create({
  transformer: superjson
});
const createRouter = t.router;
const publicQuery = t.procedure;
const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
function requireRole(role) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}
const authedQuery = t.procedure.use(requireAuth);
const adminQuery = authedQuery.use(requireRole("admin"));
const managerQuery = t.procedure.use(requireAuth).use(t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user || ctx.user.role !== "admin" && ctx.user.role !== "manager") {
    throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.insufficientRole });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
}));
export {
  adminQuery,
  authedQuery,
  createRouter,
  managerQuery,
  publicQuery
};
