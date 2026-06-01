import { faker } from "@faker-js/faker";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { DB_PATH, getWritableDb } from "./client.js";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.dirname(DB_PATH);

/** 产线固定名称 */
const LINE_NAMES = ["A线", "B线", "C线", "D线", "E线"] as const;

const WORKSHOPS = ["冲压车间", "焊接车间", "装配车间", "涂装车间", "包装车间"];

const SHIFTS = ["morning", "afternoon", "night"] as const;

const STATUSES = ["pending", "running", "done"] as const;

/**
 * 读取 SEED_SCALE 环境变量，控制数据量
 */
function getSeedScale(): number {
  const scale = Number(process.env.SEED_SCALE ?? "1.0");
  return Math.max(0.01, scale);
}

/**
 * 生成随机日期（最近 12 个月内）
 */
function randomDateInLastYear(): string {
  const now = new Date();
  const daysAgo = faker.number.int({ min: 0, max: 365 });
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * 建表 SQL
 */
function createTables(db: ReturnType<typeof getWritableDb>): void {
  db.exec(`
    DROP TABLE IF EXISTS shift_log;
    DROP TABLE IF EXISTS quality_record;
    DROP TABLE IF EXISTS work_order;
    DROP TABLE IF EXISTS production_line;

    CREATE TABLE production_line (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      workshop TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE work_order (
      id INTEGER PRIMARY KEY,
      order_no TEXT NOT NULL,
      line_id INTEGER NOT NULL REFERENCES production_line(id),
      product_code TEXT NOT NULL,
      planned_qty INTEGER NOT NULL,
      actual_qty INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE quality_record (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES work_order(id),
      line_id INTEGER NOT NULL REFERENCES production_line(id),
      inspect_qty INTEGER NOT NULL,
      defect_qty INTEGER NOT NULL,
      yield_rate REAL NOT NULL,
      recorded_at TEXT NOT NULL
    );

    CREATE TABLE shift_log (
      id INTEGER PRIMARY KEY,
      line_id INTEGER NOT NULL REFERENCES production_line(id),
      shift TEXT NOT NULL,
      date TEXT NOT NULL,
      oee REAL NOT NULL,
      downtime_min INTEGER NOT NULL
    );

    CREATE INDEX idx_work_order_line_created ON work_order(line_id, created_at);
    CREATE INDEX idx_quality_line_recorded ON quality_record(line_id, recorded_at);
    CREATE INDEX idx_shift_line_date ON shift_log(line_id, date);
  `);
}

/**
 * 填充 MES 演示数据
 */
export function seedDatabase(): void {
  const scale = getSeedScale();
  const lineCount = Math.max(5, Math.round(50 * scale));
  const workOrderCount = Math.max(100, Math.round(50000 * scale));
  const qualityCount = Math.max(100, Math.round(50000 * scale));
  const shiftCount = Math.max(50, Math.round(30000 * scale));

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = getWritableDb();
  createTables(db);

  const insertLine = db.prepare(
    `INSERT INTO production_line (id, name, workshop, capacity, status) VALUES (?, ?, ?, ?, ?)`,
  );

  const lineIds: number[] = [];
  for (let i = 0; i < lineCount; i++) {
    const id = i + 1;
    const name = LINE_NAMES[i % LINE_NAMES.length];
    insertLine.run(
      id,
      name,
      WORKSHOPS[i % WORKSHOPS.length],
      faker.number.int({ min: 500, max: 2000 }),
      faker.helpers.arrayElement(["active", "active", "active", "inactive"]),
    );
    lineIds.push(id);
  }

  const insertOrder = db.prepare(
    `INSERT INTO work_order (id, order_no, line_id, product_code, planned_qty, actual_qty, status, created_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const orderIds: number[] = [];
  for (let i = 0; i < workOrderCount; i++) {
    const id = i + 1;
    const lineId = faker.helpers.arrayElement(lineIds);
    const status = faker.helpers.arrayElement(STATUSES);
    const planned = faker.number.int({ min: 100, max: 5000 });
    const actual =
      status === "done"
        ? Math.round(planned * faker.number.float({ min: 0.7, max: 1.05 }))
        : status === "running"
          ? Math.round(planned * faker.number.float({ min: 0.2, max: 0.8 }))
          : 0;
    const createdAt = randomDateInLastYear();
    const finishedAt =
      status === "done" ? randomDateInLastYear() : null;

    insertOrder.run(
      id,
      `WO-${createdAt.replace(/-/g, "")}-${String(id).padStart(4, "0")}`,
      lineId,
      `P-${faker.string.alphanumeric(6).toUpperCase()}`,
      planned,
      actual,
      status,
      createdAt,
      finishedAt,
    );
    orderIds.push(id);
  }

  const insertQuality = db.prepare(
    `INSERT INTO quality_record (id, order_id, line_id, inspect_qty, defect_qty, yield_rate, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  for (let i = 0; i < qualityCount; i++) {
    const orderId = faker.helpers.arrayElement(orderIds);
    const order = db
      .prepare(`SELECT line_id FROM work_order WHERE id = ?`)
      .get(orderId) as { line_id: number };
    const inspectQty = faker.number.int({ min: 50, max: 500 });
    const defectQty = faker.number.int({ min: 0, max: Math.floor(inspectQty * 0.15) });
    const yieldRate = (inspectQty - defectQty) / inspectQty;

    insertQuality.run(
      i + 1,
      orderId,
      order.line_id,
      inspectQty,
      defectQty,
      yieldRate,
      randomDateInLastYear(),
    );
  }

  const insertShift = db.prepare(
    `INSERT INTO shift_log (id, line_id, shift, date, oee, downtime_min) VALUES (?, ?, ?, ?, ?, ?)`,
  );

  for (let i = 0; i < shiftCount; i++) {
    insertShift.run(
      i + 1,
      faker.helpers.arrayElement(lineIds),
      faker.helpers.arrayElement(SHIFTS),
      randomDateInLastYear(),
      faker.number.float({ min: 0.55, max: 0.98, fractionDigits: 3 }),
      faker.number.int({ min: 0, max: 120 }),
    );
  }

  db.close();
  console.log(
    `Seed complete (scale=${scale}): lines=${lineCount}, orders=${workOrderCount}, quality=${qualityCount}, shifts=${shiftCount}`,
  );
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seedDatabase();
}
