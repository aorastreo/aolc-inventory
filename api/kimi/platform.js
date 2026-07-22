import { env } from "../lib/env";
async function kimiRequest(path, token, init) {
    const resp = await fetch(`${env.kimiOpenUrl}${path}`, {
        ...init,
        headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            ...init?.headers,
        },
    });
    if (!resp.ok) {
        const text = await resp.text();
        console.warn(`[kimi] Request to ${path} failed (${resp.status}): ${text}`);
        return null;
    }
    return resp.json();
}
export const users = {
    getProfile: (token) => kimiRequest("/v1/users/me/profile", token),
};
