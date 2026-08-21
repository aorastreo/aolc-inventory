import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./kimi/auth";
import { jwtVerify } from "jose";

const JWT_SECRET_TEXT = process.env.JWT_SECRET || "aolc-secret-key-2024";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_TEXT);

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };

  // Try local auth first (from Authorization header)
  try {
    const authHeader = opts.req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { payload } = await jwtVerify(token, JWT_SECRET, { clockTolerance: 60 });
      if (payload.id && payload.username) {
        ctx.user = {
          id: payload.id as number,
          unionId: payload.username as string,
          name: (payload.name as string) || (payload.username as string),
          role: (payload.role as string) || "employee",
          avatar: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as User;
        return ctx;
      }
    }
  } catch {
    // Local auth failed, try Kimi auth
  }

  // Try Kimi auth (from cookie)
  try {
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    // Authentication is optional here
  }

  return ctx;
}
