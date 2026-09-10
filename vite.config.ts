import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), reactRouter()],
  resolve: {
    // keeps "~/..." working in Vite the same way it does in tsconfig
    alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) },
  },
  // React Router looks for its manifests under build/{client,server}; point
  // both Vite environments there so the Cloudflare plugin agrees with it.
  environments: {
    client: { build: { outDir: "build/client" } },
    ssr: { build: { outDir: "build/server" } },
  },
});
