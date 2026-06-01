import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import { healthRouter } from "./routes/health.js";
import { queryRouter } from "./routes/query.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const app = express();
const port = Number(process.env.SERVER_PORT ?? "3000");

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/query", queryRouter);

app.listen(port, () => {
  console.log(`WenShu server listening on http://localhost:${port}`);
});
