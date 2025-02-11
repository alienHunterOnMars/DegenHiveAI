import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    outDir: "dist",
    sourcemap: true,
    clean: true,
    format: ["esm"], // Ensure you're targeting CommonJS
    external: ['@hiveai/utils', "nodemailer", "mail-notifier", "z"],
    dts: {
        compilerOptions: {
            composite: false,
            incremental: false,
            tsBuildInfoFile: undefined
        }
    },
});
