import { describe, expect, it } from "vitest";
import { QueryChainError } from "../src/chains/queryChainError.js";
import { toQueryErrorResponse } from "../src/routes/query.js";

describe("query error response", () => {
  it("maps QueryChainError to structured response", () => {
    const err = new QueryChainError("SQL执行失败", {
      sql: "SELECT 1",
      model_used: "remote",
      model_name: "qwen-max",
    });
    expect(toQueryErrorResponse(err)).toEqual({
      error: "SQL执行失败",
      sql: "SELECT 1",
      model_used: "remote",
      model_name: "qwen-max",
    });
  });
});
