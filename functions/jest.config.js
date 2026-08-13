/**
 * Jest runs the TypeScript sources directly via ts-jest (no build step needed
 * for tests). Unit specs run with no external deps; integration specs expect a
 * Firestore emulator on FIRESTORE_EMULATOR_HOST (wired by `npm run
 * test:integration`, which wraps jest in `firebase emulators:exec`).
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  // Emulator round-trips (transactions, batched writes) can exceed the 5s default.
  testTimeout: 20000,
  clearMocks: true,
};
