import { describe, expect, it } from "vitest";
import { buildUserContextHeaders } from "../src/auth/signing.js";

describe("buildUserContextHeaders", () => {
  it("produces stable HMAC headers", () => {
    process.env.WENSH_DOMAIN_SIGNING_SECRET = "test-secret";
    const headers = buildUserContextHeaders(
      {
        user_id: "u1",
        username: "demo",
        roles: ["mes_viewer"],
        data_scope: { factory_ids: ["F01"] },
      },
      1717234567,
    );

    expect(headers["X-Wensh-User-Id"]).toBe("u1");
    expect(headers["X-Wensh-User-Roles"]).toBe("mes_viewer");
    expect(headers["X-Wensh-Data-Scope"]).toBe('{"factory_ids":["F01"]}');
    expect(headers["X-Wensh-Timestamp"]).toBe("1717234567");
    expect(headers["X-Wensh-User-Signature"]).toMatch(/^[a-f0-9]{64}$/);
  });
});
