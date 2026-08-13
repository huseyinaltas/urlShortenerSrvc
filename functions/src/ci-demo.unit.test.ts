/**
 * INTENTIONAL failing test — used only to prove CI catches failures.
 *
 * This whole file is throwaway. Delete it (or just close/delete the
 * `demo/ci-failure` branch) once the red CI run has been observed.
 */
describe("CI failure demo (intentional — remove me)", () => {
  it("fails on purpose so the CI run goes red", () => {
    expect(1 + 1).toBe(3);
  });
});
