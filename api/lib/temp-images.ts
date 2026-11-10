import { randomUUID } from "crypto";

type TempImage = {
  bytes: Buffer;
  mimeType: string;
  createdAt: number;
};

const STORE = new Map<string, TempImage>();
const TTL_MS = 10 * 60 * 1000; // 10 min — enough for Google to crawl
const MAX_BYTES = 4 * 1024 * 1024;

function purgeExpired() {
  const now = Date.now();
  for (const [id, img] of STORE) {
    if (now - img.createdAt > TTL_MS) STORE.delete(id);
  }
  // hard cap
  if (STORE.size > 100) {
    const oldest = [...STORE.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [id] of oldest.slice(0, STORE.size - 80)) STORE.delete(id);
  }
}

export function putTempImage(base64: string, mimeType = "image/jpeg"): string {
  purgeExpired();
  const clean = base64.includes(",") ? base64.split(",")[1] : base64;
  const bytes = Buffer.from(clean, "base64");
  if (!bytes.length) throw new Error("Imagen vacia");
  if (bytes.length > MAX_BYTES) throw new Error("Imagen demasiado grande (max 4MB)");
  const id = randomUUID().replace(/-/g, "");
  STORE.set(id, {
    bytes,
    mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
    createdAt: Date.now(),
  });
  return id;
}

export function getTempImage(id: string): TempImage | null {
  purgeExpired();
  const img = STORE.get(id);
  if (!img) return null;
  if (Date.now() - img.createdAt > TTL_MS) {
    STORE.delete(id);
    return null;
  }
  return img;
}

export function buildPublicImageUrl(req: Request, id: string): string {
  const proto = req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  return `${proto}://${host}/api/lens-image/${id}`;
}

export function buildLensSearchUrls(publicImageUrl: string) {
  const enc = encodeURIComponent(publicImageUrl);
  return {
    lens: `https://lens.google.com/uploadbyurl?url=${enc}`,
    images: `https://www.google.com/searchbyimage?image_url=${enc}&client=app`,
  };
}
