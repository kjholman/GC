export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recoverStaleAnalyses } = await import("./lib/ai/analyst");
    await recoverStaleAnalyses().catch((err) => console.error("[startup] recovery failed", err));
  }
}
