import { Router } from "express";
import type { LoginResponse, MeResponse } from "@wensh/shared";
import { z } from "zod";
import { getAuthProvider } from "../auth/providers.js";
import { getUserStore } from "../auth/userStore.js";

/** 认证相关路由 */
export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "用户名或密码无效" });
    return;
  }

  const user = await getUserStore().verifyPassword(
    parsed.data.username,
    parsed.data.password,
  );
  if (!user) {
    res.status(401).json({ error: "用户名或密码错误" });
    return;
  }

  req.session.userId = user.user_id;
  const body: LoginResponse = {
    user: {
      user_id: user.user_id,
      username: user.username,
      roles: user.roles,
    },
  };
  res.json(body);
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "退出失败" });
      return;
    }
    res.json({ ok: true });
  });
});

authRouter.get("/me", async (req, res) => {
  try {
    const user = await getAuthProvider().authenticate(req);
    const body: MeResponse = { user };
    res.json(body);
  } catch {
    res.status(401).json({ error: "未登录" });
  }
});
