import type { Request } from "express";
import type { AuthUser } from "@wensh/shared";

/** 认证提供者（V1 Local / V2 OIDC） */
export interface AuthProvider {
  /** 从请求中解析并验证用户 */
  authenticate(req: Request): Promise<AuthUser>;
}
