import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    envPrefix: ["VITE_", "API_"],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      "import.meta.env.API_URL": JSON.stringify(
        env.API_URL || "https://mydailyos.onrender.com"
      ),
    },
  };
});
