import type { Request } from "express";
import type { AuthUser } from "@wensh/shared";
import type { AuthProvider } from "./types.js";
import { getUserStore } from "./userStore.js";

/** 从 Session 解析自建账号用户 */
export class LocalAuthProvider implements AuthProvider {
  /** @inheritdoc */
  async authenticate(req: Request): Promise<AuthUser> {
    const userId = req.session?.userId;
    if (!userId) {
      throw new Error("UNAUTHORIZED");
    }
    return getUserStore().loadAuthUser(userId);
  }
}
