import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 校验问数 BFF 发来的用户上下文签名
 * @param headers - 请求头（小写键名）
 * @param secret - WENSH_DOMAIN_SIGNING_SECRET
 */
export function verifyWenshSignature(
  headers: Record<string, string | undefined>,
  secret: string,
): boolean {
  const userId = headers["x-wensh-user-id"];
  const roles = headers["x-wensh-user-roles"];
  const scope = headers["x-wensh-data-scope"];
  const ts = headers["x-wensh-timestamp"];
  const sig = headers["x-wensh-user-signature"];
  if (!userId || !roles || !scope || !ts || !sig || !secret) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${userId}${roles}${scope}${ts}`)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

/**
 * 从 Express 请求头提取小写键名映射
 * @param raw - req.headers
 */
export function normalizeHeaders(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      out[key.toLowerCase()] = value;
    } else if (Array.isArray(value)) {
      out[key.toLowerCase()] = value[0];
    }
  }
  return out;
}
