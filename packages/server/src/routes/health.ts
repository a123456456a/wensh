import { Router } from "express";
import type { HealthResponse } from "@wensh/shared";
import { DB_PATH, isDatabaseAvailable } from "../db/client.js";
import {
  isLocalModelAvailable,
  isRemoteConfigured,
} from "../chains/modelRouter.js";

/** GET /api/health 路由 */
export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const localAvailable = await isLocalModelAvailable();
  const body: HealthResponse = {
    local_model: {
      available: localAvailable,
      base_url: process.env.LOCAL_BASE_URL ?? "",
    },
    remote_model: {
      available: isRemoteConfigured(),
      model_name: process.env.QWEN_MODEL_NAME ?? "qwen-max",
    },
    database: {
      available: isDatabaseAvailable(),
      path: DB_PATH,
    },
  };
  res.json(body);
});
