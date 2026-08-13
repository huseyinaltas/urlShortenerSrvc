import { validateAndNormalizeUrl, MAX_URL_LENGTH } from "./validation";

describe("validateAndNormalizeUrl", () => {
  it("accepts and normalizes http(s) URLs", () => {
    const r = validateAndNormalizeUrl("https://Example.com/Path?b=2&a=1");
    expect(r.ok).toBe(true);
    // Host is lowercased; path/query preserved.
    expect(r.url).toBe("https://example.com/Path?b=2&a=1");
  });

  it("trims surrounding whitespace", () => {
    const r = validateAndNormalizeUrl("  https://example.com  ");
    expect(r.ok).toBe(true);
    expect(r.url).toBe("https://example.com/");
  });

  it("rejects non-string input", () => {
    expect(validateAndNormalizeUrl(undefined).ok).toBe(false);
    expect(validateAndNormalizeUrl(42 as unknown).ok).toBe(false);
  });

  it("rejects empty input", () => {
    expect(validateAndNormalizeUrl("").ok).toBe(false);
    expect(validateAndNormalizeUrl("   ").ok).toBe(false);
  });

  it("rejects dangerous / non-http schemes", () => {
    expect(validateAndNormalizeUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateAndNormalizeUrl("data:text/html,<h1>x</h1>").ok).toBe(false);
    expect(validateAndNormalizeUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateAndNormalizeUrl("ftp://example.com").ok).toBe(false);
  });

  it("rejects malformed URLs and hosts without a dot", () => {
    expect(validateAndNormalizeUrl("not a url").ok).toBe(false);
    expect(validateAndNormalizeUrl("http://localhost").ok).toBe(false);
    expect(validateAndNormalizeUrl("https://").ok).toBe(false);
  });

  it("rejects overly long URLs", () => {
    const long = "https://example.com/" + "a".repeat(MAX_URL_LENGTH);
    expect(validateAndNormalizeUrl(long).ok).toBe(false);
  });
});
