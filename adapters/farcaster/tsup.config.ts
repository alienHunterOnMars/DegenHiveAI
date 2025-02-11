import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    outDir: "dist",
    format: ["esm"], // Ensure you're targeting CommonJS
    dts: {
        compilerOptions: {
            composite: false,
            incremental: false,
            tsBuildInfoFile: undefined
        }
    },    
    sourcemap: true,
    clean: true,
    external: [
        "dotenv", // Externalize dotenv to prevent bundling
        "fs", // Externalize fs to use Node.js built-in module
        "path", // Externalize other built-ins if necessary
        "@reflink/reflink",
        "@node-llama-cpp",
        "https",
        "http",
        "agentkeepalive",
        // Add other modules you want to externalize
    ],
});
