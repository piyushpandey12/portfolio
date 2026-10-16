import { defineConfig } from "vite";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [
    {
      name: "copy-public-fallback",
      closeBundle() {
        const rootDir = import.meta.dirname || process.cwd();
        const src = path.resolve(rootDir, "public");
        const dest = path.resolve(rootDir, "dist", "public");
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true });
        }
      },
    },
  ],
});
