import { createHmac } from "node:crypto";
import type { AuthUser } from "@wensh/shared";

/**
 * 生成域 API 所需的用户上下文 Header（含 HMAC 签名）
 * @param user - 已认证用户
 * @param timestampSec - Unix 秒时间戳
 */
export function buildUserContextHeaders(
  user: AuthUser,
  timestampSec: number = Math.floor(Date.now() / 1000),
): Record<string, string> {
  const roles = user.roles.join(",");
  const dataScopeJson = JSON.stringify(user.data_scope);
  const timestamp = String(timestampSec);
  const secret = process.env.WENSH_DOMAIN_SIGNING_SECRET ?? "";
  const payload = `${user.user_id}${roles}${dataScopeJson}${timestamp}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");

  return {
    "X-Wensh-User-Id": user.user_id,
    "X-Wensh-User-Roles": roles,
    "X-Wensh-Data-Scope": dataScopeJson,
    "X-Wensh-Timestamp": timestamp,
    "X-Wensh-User-Signature": signature,
  };
}
