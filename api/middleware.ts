import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Employees may only touch their own storeId. Admin may switch stores in the UI. */
const enforceEmployeeStoreScope = t.middleware(async (opts) => {
  const { ctx, next, getRawInput } = opts;
  const user = ctx.user;
  if (user && user.role === "employee" && user.storeId != null) {
    const rawInput = await getRawInput();
    const input = rawInput as Record<string, unknown> | undefined;
    if (input && typeof input === "object" && "storeId" in input) {
      const requested = Number(input.storeId);
      if (Number.isFinite(requested) && requested !== Number(user.storeId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No autorizado para otra tienda",
        });
      }
    }
  }
  return next();
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth).use(enforceEmployeeStoreScope);
export const adminQuery = t.procedure.use(requireAuth).use(requireRole("admin"));
export const managerQuery = t.procedure.use(requireAuth).use(t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user || (ctx.user.role !== "admin" && ctx.user.role !== "manager")) {
    throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.insufficientRole });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
}));
