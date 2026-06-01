import type { Request } from "express";
import type { AuthUser } from "@wensh/shared";
import type { AuthProvider } from "./types.js";

/**
 * V2：OIDC 认证（后期实现 authorize/callback）
 */
export class OidcAuthProvider implements AuthProvider {
  /** @inheritdoc */
  async authenticate(_req: Request): Promise<AuthUser> {
    throw new Error("OIDC not implemented yet");
  }
}
