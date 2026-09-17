import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    globals: true,
    // The school's timezone, so CI (UTC) sees the same calendar the app's users
    // do. Date-only bugs -- a UTC date standing in for today -- are invisible
    // at UTC and only show up at +8.
    env: { TZ: "Asia/Manila" },
  },
});
