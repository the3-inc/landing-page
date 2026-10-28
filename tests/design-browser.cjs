const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { mkdir } = require("node:fs/promises");
const { chromium } = require(
	process.env.PLAYWRIGHT_MODULE_PATH || "playwright",
);

(async () => {
	const server = spawn(
		"python3",
		[
			"-u",
			"-m",
			"http.server",
			"0",
			"--bind",
			"127.0.0.1",
			"--directory",
			"dist",
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	let browser;
	try {
		const ready = Promise.race([
			once(server.stdout, "data").then(([data]) => {
				const match = data.toString().match(/port (\d+)/);
				assert(match, data.toString());
				return `http://127.0.0.1:${match[1]}`;
			}),
			once(server, "exit").then(([code]) => {
				throw new Error(`静的サーバーの起動失敗: ${code}`);
			}),
		]);
		const base = await ready;
		browser = await chromium.launch({ headless: true });
		await mkdir("test-results/design", { recursive: true });
		for (const scheme of ["light", "dark"]) {
			const page = await browser.newPage({
				colorScheme: scheme,
				reducedMotion: "reduce",
			});
			const failures = [];
			page.on("pageerror", (error) => failures.push(error.message));
			page.on("response", (response) => {
				if (response.status() >= 400) failures.push(response.url());
			});
			for (const width of [320, 390, 768, 1440]) {
				await page.setViewportSize({ width, height: 1000 });
				for (const path of ["/", "/products/schedula/"]) {
					await page.goto(base + path);
					const style = await page.evaluate(() => ({
						background: getComputedStyle(document.body).backgroundColor,
						font: getComputedStyle(document.body).fontFamily,
						motion: getComputedStyle(document.documentElement).scrollBehavior,
						overflow: document.documentElement.scrollWidth > innerWidth,
					}));
					assert.equal(
						style.background,
						scheme === "light" ? "rgb(250, 252, 252)" : "rgb(16, 26, 28)",
					);
					assert(style.font.includes("Helvetica Neue"));
					assert.equal(style.motion, "auto");
					assert.equal(style.overflow, false, `${scheme} ${width} ${path}`);
					await page.keyboard.press("Tab");
					assert(
						await page
							.locator(".the3-skip-link")
							.evaluate((element) => element === document.activeElement),
					);
					await page.keyboard.press("Enter");
					assert.equal(new URL(page.url()).hash, "#main");
					if (path === "/" && [390, 1440].includes(width)) {
						await page.screenshot({
							path: `test-results/design/company-${scheme}-${width}.png`,
							fullPage: true,
						});
					}
				}
			}
			assert.deepEqual(failures, []);
			await page.close();
		}
		console.log(
			"会社サイト: ライト・ダーク、4画面幅、本文スキップ、共有CSSを確認しました",
		);
	} finally {
		if (browser) await browser.close();
		server.kill("SIGTERM");
		if (server.exitCode === null) await once(server, "exit");
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
