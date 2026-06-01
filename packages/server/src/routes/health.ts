import { Router } from "express";
import type { HealthResponse } from "@wensh/shared";
import { DB_PATH, isDatabaseAvailable } from "../db/client.js";
import {
  isLocalModelAvailable,
  isRemoteConfigured,
  listRemoteProviderOptions,
  resolveRemoteModelConfig,
} from "../chains/modelRouter.js";
import { getRemoteProvider } from "../chains/remoteProvider.js";

/** GET /api/health 路由 */
export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const localAvailable = await isLocalModelAvailable();
  const defaultProvider = getRemoteProvider();
  const remote = resolveRemoteModelConfig(defaultProvider);
  const body: HealthResponse = {
    local_model: {
      available: localAvailable,
      base_url: process.env.LOCAL_BASE_URL ?? "",
    },
    remote_model: {
      available: isRemoteConfigured(),
      provider: remote.provider,
      provider_label: remote.label,
      model_name: remote.modelName,
      default_provider: defaultProvider,
      providers: listRemoteProviderOptions(),
    },
    database: {
      available: isDatabaseAvailable(),
      path: DB_PATH,
    },
  };
  res.json(body);
});
