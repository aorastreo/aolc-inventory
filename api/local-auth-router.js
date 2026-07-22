import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { employees } from "@db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "aolc-secret-key-2024";
export const localAuthRouter = createRouter({
    // Login with username/password
    login: publicQuery
        .input(z.object({
        username: z.string(),
        password: z.string(),
    }))
        .mutation(async ({ input }) => {
        const db = getDb();
        const user = await db.select().from(employees)
            .where(and(eq(employees.username, input.username), eq(employees.isActive, true))).limit(1);
        if (user.length === 0) {
            throw new Error("Usuario o contraseña incorrectos");
        }
        const valid = await bcrypt.compare(input.password, user[0].password);
        if (!valid) {
            throw new Error("Usuario o contraseña incorrectos");
        }
        const token = jwt.sign({ id: user[0].id, username: user[0].username, name: user[0].name, role: user[0].role, storeId: user[0].storeId }, JWT_SECRET, { expiresIn: "7d" });
        return { token, user: { id: user[0].id, name: user[0].name, username: user[0].username, role: user[0].role, storeId: user[0].storeId } };
    }),
    // Register new employee (admin only)
    register: publicQuery
        .input(z.object({
        username: z.string().min(3),
        password: z.string().min(4),
        name: z.string(),
        storeId: z.number(),
        role: z.enum(["employee", "manager", "admin"]).default("employee"),
    }))
        .mutation(async ({ input }) => {
        const db = getDb();
        // Check if username exists
        const existing = await db.select().from(employees)
            .where(eq(employees.username, input.username)).limit(1);
        if (existing.length > 0) {
            throw new Error("El usuario ya existe");
        }
        const hashedPassword = await bcrypt.hash(input.password, 10);
        const result = await db.insert(employees).values({
            storeId: input.storeId,
            username: input.username,
            password: hashedPassword,
            name: input.name,
            role: input.role,
        });
        return { id: Number(result[0].insertId) };
    }),
    // Get current user from token
    me: publicQuery
        .input(z.object({ token: z.string() }))
        .query(async ({ input }) => {
        try {
            const decoded = jwt.verify(input.token, JWT_SECRET);
            return {
                id: decoded.id,
                name: decoded.name,
                username: decoded.username,
                role: decoded.role,
                storeId: decoded.storeId,
            };
        }
        catch {
            return null;
        }
    }),
    // List employees by store
    list: publicQuery
        .input(z.object({ storeId: z.number() }))
        .query(async ({ input }) => {
        const db = getDb();
        return db.select({
            id: employees.id,
            username: employees.username,
            name: employees.name,
            role: employees.role,
            isActive: employees.isActive,
            createdAt: employees.createdAt,
        }).from(employees)
            .where(eq(employees.storeId, input.storeId));
    }),
});
