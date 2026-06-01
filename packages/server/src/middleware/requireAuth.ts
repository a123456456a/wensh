import type { RequestHandler } from "express";
import type { AuthUser } from "@wensh/shared";
import { getAuthProvider, isAuthEnabled } from "../auth/providers.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

/** 保护需登录的路由；AUTH_ENABLED=false 时跳过 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  if (!isAuthEnabled()) {
    return next();
  }
  try {
    req.user = await getAuthProvider().authenticate(req);
    next();
  } catch {
    res.status(401).json({ error: "未登录，请先登录" });
  }
};
