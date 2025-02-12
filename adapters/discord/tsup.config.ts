import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: {
        compilerOptions: {
            composite: false,
            incremental: false,
            tsBuildInfoFile: undefined
        }
    },
    clean: true,
    sourcemap: true,
    external: ['@hiveai/utils']
}); 