export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // A failed background request must never take the whole site down: log it and carry on.
    process.on("unhandledRejection", (reason) => console.error("[server] unhandled rejection (kept running)", reason));
    process.on("uncaughtException", (err) => console.error("[server] uncaught exception (kept running)", err));
    const { recoverStaleAnalyses } = await import("./lib/ai/analyst");
    await recoverStaleAnalyses().catch((err) => console.error("[startup] recovery failed", err));
  }
}
