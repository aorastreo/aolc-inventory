function isLocalhost(headers) {
    const host = headers.get("host") || "";
    return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}
export function getSessionCookieOptions(headers) {
    const localhost = isLocalhost(headers);
    return {
        httpOnly: true,
        path: "/",
        sameSite: localhost ? "Lax" : "None",
        secure: !localhost,
    };
}
