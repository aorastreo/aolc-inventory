import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
const JWT_SECRET = process.env.JWT_SECRET || "aolc-secret-key-2024";
// Create raw MySQL connection
async function getRawDb() {
    return mysql.createConnection(process.env.DATABASE_URL);
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
            const [rows] = await conn.execute("SELECT id, storeId, username, password, name, role FROM employees WHERE username = ? AND isActive = true LIMIT 1", [input.username]);
            if (rows.length === 0) {
                throw new Error("Usuario o contraseña incorrectos");
            }
            const user = rows[0];
            const valid = await bcrypt.compare(input.password, user.password);
            if (!valid) {
                throw new Error("Usuario o contraseña incorrectos");
            }
            const token = jwt.sign({ id: user.id, username: user.username, name: user.name, role: user.role, storeId: user.storeId }, JWT_SECRET, { expiresIn: "7d" });
            return {
                token,
                user: { id: user.id, name: user.name, username: user.username, role: user.role, storeId: user.storeId }
            };
        }
        finally {
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
            const [existing] = await conn.execute("SELECT id FROM employees WHERE username = ?", [input.username]);
            if (existing.length > 0) {
                throw new Error("El usuario ya existe");
            }
            const hashedPassword = await bcrypt.hash(input.password, 10);
            const [result] = await conn.execute("INSERT INTO employees (storeId, username, password, name, role) VALUES (?, ?, ?, ?, ?)", [input.storeId, input.username, hashedPassword, input.name, input.role]);
            return { id: Number(result.insertId) };
        }
        finally {
            await conn.end();
        }
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
        const conn = await getRawDb();
        try {
            const [rows] = await conn.execute("SELECT id, username, name, role, isActive, createdAt FROM employees WHERE storeId = ?", [input.storeId]);
            return rows;
        }
        finally {
            await conn.end();
        }
    }),
});
