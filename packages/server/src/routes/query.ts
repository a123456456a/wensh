import { Router } from "express";
import type { QueryErrorResponse } from "@wensh/shared";
import { z } from "zod";
import { runQueryChain, QueryChainError } from "../chains/buildChain.js";

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

queryRouter.post("/", async (req, res, next) => {
  const parsed = queryBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "请求参数无效";
    res.status(400).json({ error: message } satisfies QueryErrorResponse);
    return;
  }

  try {
    const result = await runQueryChain(parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 将 QueryChainError 转为计划规定的错误响应
 */
export function toQueryErrorResponse(err: unknown): QueryErrorResponse {
  if (err instanceof QueryChainError) {
    return {
      error: err.message,
      sql: err.context.sql,
      model_used: err.context.model_used,
      model_name: err.context.model_name,
    };
  }
  const message = err instanceof Error ? err.message : "查询失败";
  return { error: message };
}
