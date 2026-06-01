import { Router } from "express";
import { z } from "zod";
import { runQueryChain } from "../chains/buildChain.js";

const historyItemSchema = z.object({
  question: z.string().min(1).max(500),
  sql: z.string().min(1),
});

const queryBodySchema = z.object({
  question: z.string().min(1).max(500),
  interpret: z.boolean().optional(),
  history: z.array(historyItemSchema).max(2).optional(),
});

/** POST /api/query 路由 */
export const queryRouter = Router();

queryRouter.post("/", async (req, res) => {
  const parsed = queryBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "请求参数无效" });
    return;
  }

  try {
    const result = await runQueryChain(parsed.data);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询失败";
    res.status(500).json({ error: message });
  }
});
