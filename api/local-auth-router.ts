import { z } from "zod";
import { createRouter, publicQuery, adminQuery, authedQuery } from "./middleware";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import mysql from "mysql2/promise";
import { getJwtSecretKey } from "./lib/auth-secret";

async function getRawDb() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

async function signEmployeeToken(user: {
  id: number;
  username: string;
  name: string;
  role: string;
  storeId: number;
}) {
  return new SignJWT({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    storeId: user.storeId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getJwtSecretKey());
}

export const localAuthRouter = createRouter({
  // Login by store (select store + password) — public by design
  loginByStore: publicQuery
    .input(
      z.object({
        storeId: z.number(),
        password: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const conn = await getRawDb();
      try {
        const [rows]: any = await conn.execute(
          "SELECT id, storeId, username, password, name, role FROM employees WHERE storeId = ? AND isActive = true",
          [input.storeId],
        );

        if (rows.length === 0) {
          throw new Error("No hay usuarios configurados para esta tienda");
        }

        for (const user of rows) {
          const valid = await bcrypt.compare(input.password, user.password);
          if (valid) {
            const token = await signEmployeeToken(user);
            return {
              token,
              user: {
                id: user.id,
                name: user.name,
                username: user.username,
                role: user.role,
                storeId: user.storeId,
              },
            };
          }
        }

        throw new Error("Contraseña incorrecta");
      } finally {
        await conn.end();
      }
    }),

  // Login with username/password (admin / named users)
  login: publicQuery
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const conn = await getRawDb();
      try {
        const [rows]: any = await conn.execute(
          "SELECT id, storeId, username, password, name, role FROM employees WHERE username = ? AND isActive = true LIMIT 1",
          [input.username],
        );

        if (rows.length === 0) {
          throw new Error("Usuario o contraseña incorrectos");
        }

        const user = rows[0];
        const valid = await bcrypt.compare(input.password, user.password);
        if (!valid) {
          throw new Error("Usuario o contraseña incorrectos");
        }

        const token = await signEmployeeToken(user);
        return {
          token,
          user: {
            id: user.id,
            name: user.name,
            username: user.username,
            role: user.role,
            storeId: user.storeId,
          },
        };
      } finally {
        await conn.end();
      }
    }),

  // Register new employee — admin only (was open to the internet)
  register: adminQuery
    .input(
      z.object({
        username: z.string().min(3),
        password: z.string().min(4),
        name: z.string().min(1),
        storeId: z.number(),
        role: z.enum(["employee", "manager", "admin"]).default("employee"),
      }),
    )
    .mutation(async ({ input }) => {
      const conn = await getRawDb();
      try {
        const [existing]: any = await conn.execute("SELECT id FROM employees WHERE username = ?", [
          input.username,
        ]);

        if (existing.length > 0) {
          throw new Error("El usuario ya existe");
        }

        const hashedPassword = await bcrypt.hash(input.password, 10);
        const [result]: any = await conn.execute(
          "INSERT INTO employees (storeId, username, password, name, role) VALUES (?, ?, ?, ?, ?)",
          [input.storeId, input.username, hashedPassword, input.name, input.role],
        );

        return { id: Number(result.insertId) };
      } finally {
        await conn.end();
      }
    }),

  me: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      try {
        const { payload } = await jwtVerify(input.token, getJwtSecretKey(), { clockTolerance: 60 });
        return {
          id: payload.id as number,
          name: payload.name as string,
          username: payload.username as string,
          role: payload.role as string,
          storeId: payload.storeId as number,
        };
      } catch {
        return null;
      }
    }),

  list: authedQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input, ctx }) => {
      // Non-admins only see their own store
      if (ctx.user.role !== "admin" && ctx.user.storeId !== input.storeId) {
        throw new Error("No autorizado para esta tienda");
      }

      const conn = await getRawDb();
      try {
        const [rows]: any = await conn.execute(
          "SELECT id, username, name, role, isActive, createdAt FROM employees WHERE storeId = ?",
          [input.storeId],
        );
        return rows;
      } finally {
        await conn.end();
      }
    }),

  // Disabled as a public bootstrap. Create users from Settings as admin instead.
  seedDefaults: adminQuery.mutation(async () => {
    throw new Error(
      "seedDefaults está deshabilitado. Crea usuarios desde Configuración con una cuenta admin.",
    );
  }),
});
