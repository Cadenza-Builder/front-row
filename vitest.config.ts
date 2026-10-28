import { defineConfig } from "vitest/config";

// Only the pipeline runs on its own; app/, lib/lectures/ and ios/ plug into Cadenza and are tested there.
export default defineConfig({ test: { include: ["lib/lecture/**/*.test.ts"] } });
