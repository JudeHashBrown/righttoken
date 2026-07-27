import { describe, expect, it } from "vitest";
import {
  assertSafeTestDatabaseUrl,
  deriveTestDatabaseUrl
} from "../../../scripts/run-integration-tests.mjs";

describe("integration test database runner", () => {
  it("derives a separate test database without changing credentials or port", () => {
    expect(
      deriveTestDatabaseUrl(
        "postgresql://righttoken:secret@127.0.0.1:55432/righttoken_recall"
      )
    ).toBe(
      "postgresql://righttoken:secret@127.0.0.1:55432/righttoken_recall_test"
    );
  });

  it("refuses to reset a database whose name does not end in _test", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgresql://righttoken:secret@127.0.0.1:55432/righttoken_recall"
      )
    ).toThrow("must end with _test");
  });
});
