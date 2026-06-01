import { describe, expect, it } from "vitest";
import { verifyWenshSignature } from "./fixtures/verifyWenshSignature.js";
import { buildUserContextHeaders } from "../src/auth/signing.js";

describe("verifyWenshSignature", () => {
  it("accepts valid signature from buildUserContextHeaders", () => {
    process.env.WENSH_DOMAIN_SIGNING_SECRET = "shared-secret";
    const user = {
      user_id: "u1",
      username: "demo",
      roles: ["mes_viewer"],
      data_scope: { factory_ids: ["F01"] },
    };
    const ts = Math.floor(Date.now() / 1000);
    const headers = buildUserContextHeaders(user, ts);
    const normalized = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    expect(verifyWenshSignature(normalized, "shared-secret")).toBe(true);
  });
});
