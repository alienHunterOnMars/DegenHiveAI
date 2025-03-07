import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    outDir: "dist",
    sourcemap: true,
    clean: true,
    format: ["esm"], // Ensure you're targeting CommonJS
    dts: {
        compilerOptions: {
            composite: false,
            incremental: false,
            tsBuildInfoFile: undefined
        }
    },    
    external: ['@hiveai/utils', "agent-twitter-client", "events", "js-sha1", "twitter-api-v2", "uuid", "zod"],
});
