import { copyFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// 公開済みのロゴURLを維持し、dev・直接のAstroビルドも同じ正本を使う。
copyFileSync(
	new URL("./packages/brand/assets/the3-symbol.svg", import.meta.url),
	new URL("./public/brand/the3-symbol.svg", import.meta.url),
);

export default defineConfig({
	site: "https://the3.co.jp",
	output: "static",
	vite: { plugins: [tailwindcss()] },
});
