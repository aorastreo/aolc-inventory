import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import mysql from "mysql2/promise";

const JWT_SECRET_TEXT = process.env.JWT_SECRET || "aolc-secret-key-2024";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_TEXT);

// Create raw MySQL connection
async function getRawDb() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

export const localAuthRouter = createRouter({
  // Login with username/password
  login: publicQuery
    .input(z.object({
      username: z.string(),
      password: z.string(),
    }))
    .mutation(async ({ input }) => {
      const conn = await getRawDb();
      try {
        const [rows]: any = await conn.execute(
          "SELECT id, storeId, username, password, name, role FROM employees WHERE username = ? AND isActive = true LIMIT 1",
          [input.username]
        );

        if (rows.length === 0) {
          throw new Error("Usuario o contraseña incorrectos");
        }

        const user = rows[0];
        const valid = await bcrypt.compare(input.password, user.password);
        if (!valid) {
          throw new Error("Usuario o contraseña incorrectos");
        }

        const token = await new SignJWT({ id: user.id, username: user.username, name: user.name, role: user.role, storeId: user.storeId })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime("7d")
          .sign(JWT_SECRET);

        return {
          token,
          user: { id: user.id, name: user.name, username: user.username, role: user.role, storeId: user.storeId }
        };
      } finally {
        await conn.end();
      }
    }),

  // Register new employee
  register: publicQuery
    .input(z.object({
      username: z.string().min(3),
      password: z.string().min(4),
      name: z.string(),
      storeId: z.number(),
      role: z.enum(["employee", "manager", "admin"]).default("employee"),
    }))
    .mutation(async ({ input }) => {
      const conn = await getRawDb();
      try {
        const [existing]: any = await conn.execute(
          "SELECT id FROM employees WHERE username = ?",
          [input.username]
        );

        if (existing.length > 0) {
          throw new Error("El usuario ya existe");
        }

        const hashedPassword = await bcrypt.hash(input.password, 10);

        const [result]: any = await conn.execute(
          "INSERT INTO employees (storeId, username, password, name, role) VALUES (?, ?, ?, ?, ?)",
          [input.storeId, input.username, hashedPassword, input.name, input.role]
        );

        return { id: Number(result.insertId) };
      } finally {
        await conn.end();
      }
    }),

  // Get current user from token
  me: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      try {
        const { payload } = await jwtVerify(input.token, JWT_SECRET, { clockTolerance: 60 });
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

  // List employees by store
  list: publicQuery
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const conn = await getRawDb();
      try {
        const [rows]: any = await conn.execute(
          "SELECT id, username, name, role, isActive, createdAt FROM employees WHERE storeId = ?",
          [input.storeId]
        );
        return rows;
      } finally {
        await conn.end();
      }
    }),

  // Seed default employees (idempotent)
  seedDefaults: publicQuery
    .mutation(async () => {
      const conn = await getRawDb();
      try {
        // Check if German exists
        const [existing]: any = await conn.execute(
          "SELECT id FROM employees WHERE username = ?",
          ["german"]
        );

        if (existing.length === 0) {
          const hashedPassword = await bcrypt.hash("german123", 10);
          await conn.execute(
            "INSERT INTO employees (storeId, username, password, name, role) VALUES (?, ?, ?, ?, ?)",
            [1, "german", hashedPassword, "German", "employee"]
          );
          return { created: true, message: "Usuario German creado exitosamente" };
        }

        return { created: false, message: "Usuario German ya existe" };
      } finally {
        await conn.end();
      }
    }),
});
