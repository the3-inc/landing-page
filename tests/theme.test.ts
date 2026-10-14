import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";

const source = readFileSync(
	new URL("../src/layouts/SiteLayout.astro", import.meta.url),
	"utf8",
).match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];

function page(saved: string | null, dark = false, storageUnavailable = false) {
	const values = new Map(saved ? [["theme", saved]] : []);
	const label = { hidden: true };
	const selector = Object.assign(new EventTarget(), {
		value: "system",
		closest: () => label,
	});
	const meta = { content: "" };
	const document = Object.assign(new EventTarget(), {
		documentElement: { dataset: { theme: "" } },
		querySelector: () => meta,
		getElementById: () => selector,
	});
	const system = Object.assign(new EventTarget(), { matches: dark });
	const localStorage = {
		getItem: (key: string) => {
			if (storageUnavailable) throw new Error("Storage disabled");
			return values.get(key) ?? null;
		},
		setItem: (key: string, value: string) => {
			if (storageUnavailable) throw new Error("Storage disabled");
			values.set(key, value);
		},
		removeItem: (key: string) => {
			if (storageUnavailable) throw new Error("Storage disabled");
			values.delete(key);
		},
	};
	if (!source) throw new Error("Theme script missing");
	runInNewContext(source, {
		document,
		localStorage,
		window: { matchMedia: () => system },
	});
	const initialTheme = document.documentElement.dataset.theme;
	document.dispatchEvent(new Event("DOMContentLoaded"));
	return {
		initialTheme,
		label,
		meta,
		selector,
		values,
		theme: () => document.documentElement.dataset.theme,
		choose: (value: string) => {
			selector.value = value;
			selector.dispatchEvent(new Event("change"));
		},
		setSystem: (value: boolean) => {
			system.matches = value;
			system.dispatchEvent(new Event("change"));
		},
	};
}

test("uses the system theme before rendering and follows system changes", () => {
	const view = page(null, true);
	expect(view.initialTheme).toBe("dark");
	expect(view.label.hidden).toBe(false);
	expect(view.selector.value).toBe("system");
	view.setSystem(false);
	expect(view.theme()).toBe("light");
	expect(view.meta.content).toBe("#fafbf9");
});

test.each(["light", "dark"])(
	"restores and saves explicit %s choices",
	(theme) => {
		const view = page(theme, theme === "light");
		expect(view.initialTheme).toBe(theme);
		expect(view.selector.value).toBe(theme);
		view.setSystem(theme === "dark");
		expect(view.theme()).toBe(theme);
		const other = theme === "light" ? "dark" : "light";
		view.choose(other);
		expect(view.theme()).toBe(other);
		expect(view.values.get("theme")).toBe(other);
		view.choose("system");
		expect(view.values.has("theme")).toBe(false);
		expect(view.theme()).toBe(theme);
	},
);

test("ignores invalid stored values and works when storage is blocked", () => {
	expect(page("invalid", true).initialTheme).toBe("dark");
	const view = page(null, false, true);
	view.choose("dark");
	expect(view.theme()).toBe("dark");
	view.choose("system");
	expect(view.theme()).toBe("light");
});
