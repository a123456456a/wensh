import session from "express-session";
import type { Express } from "express";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

/**
 * 挂载 Session 中间件
 * @param app - Express 应用
 */
export function setupSession(app: Express): void {
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? "dev-insecure-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: Number(process.env.SESSION_MAX_AGE_MS ?? "86400000"),
      },
    }),
  );
}
