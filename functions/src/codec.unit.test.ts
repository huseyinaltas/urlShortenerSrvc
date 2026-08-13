import {
  generateCode,
  validateAlias,
  isReserved,
  ALPHABET,
  DEFAULT_CODE_LENGTH,
} from "./codec";

describe("codec.generateCode", () => {
  it("produces a code of the requested length", () => {
    expect(generateCode()).toHaveLength(DEFAULT_CODE_LENGTH);
    expect(generateCode(10)).toHaveLength(10);
  });

  it("uses only base62 alphabet characters", () => {
    const code = generateCode(200);
    for (const ch of code) {
      expect(ALPHABET).toContain(ch);
    }
  });

  it("is effectively unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateCode());
    // 62^7 keyspace — 5000 draws should collide ~never.
    expect(seen.size).toBe(5000);
  });
});

describe("codec.validateAlias", () => {
  it("accepts valid aliases", () => {
    expect(validateAlias("my-link_1")).toBeNull();
    expect(validateAlias("abc")).toBeNull();
  });

  it("rejects too-short, too-long, or illegal aliases", () => {
    expect(validateAlias("ab")).not.toBeNull();
    expect(validateAlias("a".repeat(33))).not.toBeNull();
    expect(validateAlias("has space")).not.toBeNull();
    expect(validateAlias("emoji😀")).not.toBeNull();
  });

  it("rejects reserved words", () => {
    expect(validateAlias("api")).not.toBeNull();
    expect(validateAlias("APP")).not.toBeNull();
  });
});

describe("codec.isReserved", () => {
  it("is case-insensitive", () => {
    expect(isReserved("API")).toBe(true);
    expect(isReserved("health")).toBe(true);
    expect(isReserved("somethingElse")).toBe(false);
  });
});
