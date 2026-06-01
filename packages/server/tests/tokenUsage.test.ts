import { describe, expect, it } from "vitest";
import type { AIMessage } from "@langchain/core/messages";
import {
  accumulateQueryTokens,
  addTokenUsage,
  createEmptyQueryTokenUsage,
  extractTokenUsage,
} from "../src/utils/tokenUsage.js";

describe("tokenUsage", () => {
  it("extracts usage from usage_metadata", () => {
    const message = {
      content: "hello",
      usage_metadata: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
      },
    } as AIMessage;

    expect(extractTokenUsage(message)).toEqual({
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
    });
  });

  it("accumulates local and remote separately", () => {
    const bucket = createEmptyQueryTokenUsage();
    accumulateQueryTokens(bucket, "local", {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    });
    accumulateQueryTokens(bucket, "remote", {
      input_tokens: 200,
      output_tokens: 80,
      total_tokens: 280,
    });

    expect(bucket.local.total_tokens).toBe(150);
    expect(bucket.remote.total_tokens).toBe(280);
  });

  it("adds token usage in place", () => {
    const target = { input_tokens: 1, output_tokens: 2, total_tokens: 3 };
    addTokenUsage(target, {
      input_tokens: 4,
      output_tokens: 5,
      total_tokens: 9,
    });
    expect(target.total_tokens).toBe(12);
  });
});
