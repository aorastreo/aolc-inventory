import * as jose from "jose";
import { env } from "../lib/env";
const JWT_ALG = "HS256";
export async function signSessionToken(payload) {
    const secret = new TextEncoder().encode(env.appSecret);
    return new jose.SignJWT(payload)
        .setProtectedHeader({ alg: JWT_ALG })
        .setIssuedAt()
        .setExpirationTime("1 year")
        .sign(secret);
}
export async function verifySessionToken(token) {
    if (!token) {
        console.warn("[session] No token provided for verification.");
        return null;
    }
    try {
        const secret = new TextEncoder().encode(env.appSecret);
        const { payload } = await jose.jwtVerify(token, secret, {
            algorithms: [JWT_ALG],
        });
        const { unionId, clientId } = payload;
        if (!unionId || !clientId) {
            console.warn("[session] JWT payload missing required fields.");
            return null;
        }
        return { unionId, clientId };
    }
    catch (error) {
        console.warn("[session] JWT verification failed:", error);
        return null;
    }
}
