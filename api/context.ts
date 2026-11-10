import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { authenticateRequest } from "./kimi/auth";
import { getJwtSecretKey } from "./lib/auth-secret";
import { jwtVerify } from "jose";

/** Session user from local employee JWT or legacy Kimi OAuth. */
export type AuthUser = {
  id: number;
  unionId: string;
  name: string;
  role: string;
  storeId?: number;
  avatar: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: AuthUser;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };

  // Try local employee JWT first (Authorization: Bearer)
  try {
    const authHeader = opts.req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { payload } = await jwtVerify(token, getJwtSecretKey(), { clockTolerance: 60 });
      if (payload.id && payload.username) {
        ctx.user = {
          id: payload.id as number,
          unionId: payload.username as string,
          name: (payload.name as string) || (payload.username as string),
          role: (payload.role as string) || "employee",
          storeId: typeof payload.storeId === "number" ? payload.storeId : Number(payload.storeId) || undefined,
          avatar: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return ctx;
      }
    }
  } catch {
    // Local auth failed, try Kimi auth
  }

  // Try Kimi auth (from cookie)
  try {
    const kimiUser = await authenticateRequest(opts.req.headers);
    if (kimiUser) {
      ctx.user = {
        id: kimiUser.id,
        unionId: kimiUser.unionId,
        name: kimiUser.name || kimiUser.unionId,
        role: kimiUser.role,
        avatar: kimiUser.avatar ?? null,
        createdAt: kimiUser.createdAt,
        updatedAt: kimiUser.updatedAt,
      };
    }
  } catch {
    // Authentication is optional here; procedures enforce it
  }

  return ctx;
}
