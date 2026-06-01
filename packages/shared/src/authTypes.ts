/** 问数平台统一用户上下文（自建账号与 SSO 输出相同结构） */
export interface AuthUser {
  user_id: string;
  username: string;
  roles: string[];
  data_scope: {
    factory_ids?: string[];
    workshop_ids?: string[];
    line_ids?: string[];
  };
}

/** POST /api/auth/login 请求体 */
export interface LoginRequest {
  username: string;
  password: string;
}

/** POST /api/auth/login 响应 */
export interface LoginResponse {
  user: Pick<AuthUser, "user_id" | "username" | "roles">;
}

/** GET /api/auth/me 响应 */
export interface MeResponse {
  user: AuthUser;
}

/** POST /api/auth/logout 响应 */
export interface LogoutResponse {
  ok: boolean;
}
