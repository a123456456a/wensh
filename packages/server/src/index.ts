import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import type { QueryErrorResponse } from "@wensh/shared";
import { healthRouter } from "./routes/health.js";
import { queryRouter, toQueryErrorResponse } from "./routes/query.js";
import { QueryChainError } from "./chains/queryChainError.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const app = express();
const port = Number(process.env.SERVER_PORT ?? "3000");

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/query", queryRouter);

/** 全局错误处理中间件 */
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const body: QueryErrorResponse = toQueryErrorResponse(err);
    const status = err instanceof QueryChainError ? 500 : 500;
    console.error("[WenShu]", body.error);
    res.status(status).json(body);
  },
);

app.listen(port, () => {
  console.log(`WenShu server listening on http://localhost:${port}`);
});
