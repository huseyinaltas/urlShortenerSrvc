import { resolveBaseUrl, buildShortUrlFrom, firstHeaderValue } from "./urls";

describe("resolveBaseUrl", () => {
  it("prefers an explicit PUBLIC_BASE_URL override (trimmed)", () => {
    expect(
      resolveBaseUrl({
        publicBaseUrl: "https://sho.rt/",
        isEmulator: true,
        forwardedHost: "example.web.app",
        host: "127.0.0.1:5001",
      }),
    ).toBe("https://sho.rt");
  });

  it("uses the Hosting emulator origin under the emulator, never the internal Host", () => {
    // This is the exact bug: the function's Host is 127.0.0.1:5001 (Functions
    // emulator), which is not clickable. We must return the Hosting origin.
    expect(
      resolveBaseUrl({
        isEmulator: true,
        forwardedHost: "127.0.0.1:5001",
        host: "127.0.0.1:5001",
        protocol: "http",
      }),
    ).toBe("http://localhost:5050");
  });

  it("honors a custom emulator base override", () => {
    expect(
      resolveBaseUrl({
        isEmulator: true,
        emulatorBaseUrl: "http://localhost:9099",
        host: "127.0.0.1:5001",
      }),
    ).toBe("http://localhost:9099");
  });

  it("uses X-Forwarded-Host behind real Hosting", () => {
    expect(
      resolveBaseUrl({
        isEmulator: false,
        forwardedHost: "shortly.web.app",
        forwardedProto: "https",
        host: "app-abc123-uc.a.run.app",
      }),
    ).toBe("https://shortly.web.app");
  });

  it("falls back to the request Host when nothing else is available", () => {
    expect(
      resolveBaseUrl({
        isEmulator: false,
        host: "my-host:8080",
        protocol: "http",
      }),
    ).toBe("http://my-host:8080");
  });
});

describe("buildShortUrlFrom", () => {
  it("appends the code to the resolved base", () => {
    expect(
      buildShortUrlFrom({ isEmulator: true }, "abc123"),
    ).toBe("http://localhost:5050/abc123");
  });

  it("returns a relative path when no base can be resolved", () => {
    expect(buildShortUrlFrom({ isEmulator: false }, "abc123")).toBe("/abc123");
  });
});

describe("firstHeaderValue", () => {
  it("handles string, comma list, and array headers", () => {
    expect(firstHeaderValue("a.com")).toBe("a.com");
    expect(firstHeaderValue("a.com, b.com")).toBe("a.com");
    expect(firstHeaderValue(["a.com", "b.com"])).toBe("a.com");
    expect(firstHeaderValue(undefined)).toBeUndefined();
  });
});
