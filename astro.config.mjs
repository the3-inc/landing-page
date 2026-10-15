import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://the3.co.jp",
	output: "static",
	vite: { plugins: [tailwindcss()] },
});
