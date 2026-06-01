import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { QueryErrorResponse } from "@wensh/shared";
import { seedDefaultUsers } from "./auth/seedUsers.js";
import { isAuthEnabled } from "./auth/providers.js";
import { setupSession } from "./auth/session.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { queryRouter, toQueryErrorResponse } from "./routes/query.js";
import { QueryChainError } from "./chains/queryChainError.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const app = express();
const port = Number(process.env.SERVER_PORT ?? "3000");
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

app.use(
  cors({
    origin: webOrigin,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
setupSession(app);

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
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

async function bootstrap(): Promise<void> {
  if (isAuthEnabled()) {
    await seedDefaultUsers();
    console.log("[WenShu] Auth enabled — default user demo/demo123 (if new)");
  }

  app.listen(port, () => {
    console.log(`WenShu server listening on http://localhost:${port}`);
  });
}

void bootstrap();
