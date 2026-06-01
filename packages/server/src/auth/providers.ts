import type { AuthProvider } from "./types.js";
import { LocalAuthProvider } from "./localAuthProvider.js";
import { OidcAuthProvider } from "./oidcAuthProvider.js";

/** OIDC 尚未实现时的占位错误 */
export class AuthConfigError extends Error {}

/**
 * 按 AUTH_PROVIDER 环境变量选择认证提供者
 */
export function getAuthProvider(): AuthProvider {
  const mode = (process.env.AUTH_PROVIDER ?? "local").trim().toLowerCase();
  if (mode === "local") {
    return new LocalAuthProvider();
  }
  if (mode === "oidc") {
    return new OidcAuthProvider();
  }
  throw new AuthConfigError(`Unsupported AUTH_PROVIDER: ${mode}`);
}

/** 是否启用登录保护 */
export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true";
}
