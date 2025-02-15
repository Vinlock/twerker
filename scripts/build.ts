import * as esbuild from "esbuild"
import { rm } from "node:fs/promises"

async function build() {
  // Clean dist directory
  await rm("dist", { recursive: true, force: true })

  // Build main files
  await esbuild.build({
    entryPoints: ["src/index.ts", "src/twerker.ts"],
    outdir: "dist",
    bundle: false,
    platform: "node",
    format: "esm",
    target: "node16",
    sourcemap: true,
    outExtension: { ".js": ".js" },
  })

  // Build type declarations
  const { execSync } = await import("child_process")
  execSync("tsc --emitDeclarationOnly --declaration --outDir dist", {
    stdio: "inherit",
  })
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
}) 