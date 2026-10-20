import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";

const source = readFileSync(
	new URL("../public/contact.js", import.meta.url),
	"utf8",
);

function contact() {
	const fields = { disabled: false };
	const status = { textContent: "" };
	const events: unknown[][] = [];
	const requests: unknown[][] = [];
	let submit: (event: { preventDefault: () => void }) => Promise<void>;
	let finish: (value: { ok: boolean }) => void;
	let fail: (error: Error) => void;
	let resets = 0;
	let valid = true;
	const form = {
		action: "https://contact.example.test/submit",
		querySelector: () => fields,
		addEventListener: (_name: string, callback: typeof submit) => {
			submit = callback;
		},
		reportValidity: () => valid,
		setAttribute: () => {},
		reset: () => {
			resets++;
		},
	};
	runInNewContext(source, {
		document: {
			getElementById: (id: string) => (id === "contact-form" ? form : status),
		},
		FormData: class {},
		AbortController,
		setTimeout,
		clearTimeout,
		fetch: (...args: unknown[]) => {
			requests.push(args);
			return new Promise((resolve, reject) => {
				fail = reject;
				finish = resolve;
			});
		},
		window: { gtag: (...args: unknown[]) => events.push(args) },
	});
	return {
		fields,
		status,
		events,
		requests,
		resets: () => resets,
		setValid: (value: boolean) => {
			valid = value;
		},
		submit: () => submit({ preventDefault: () => {} }),
		finish: (ok: boolean) => finish({ ok }),
		fail: () => fail(new Error("Network unavailable")),
	};
}

test("records one lead only after acknowledgement, excluding form contents", async () => {
	const view = contact();
	const pending = view.submit();
	await view.submit();
	expect(view.requests).toHaveLength(1);
	expect(view.events).toHaveLength(0);
	expect(view.fields.disabled).toBe(true);
	view.finish(true);
	await pending;
	expect(view.events).toEqual([
		["event", "generate_lead", { form_id: "contact" }],
	]);
	expect(view.resets()).toBe(1);
	await view.submit();
	expect(view.requests).toHaveLength(1);
});

test("keeps input after a rejected submission and permits a successful retry", async () => {
	const view = contact();
	const pending = view.submit();
	view.finish(false);
	await pending;
	expect(view.events).toHaveLength(0);
	expect(view.resets()).toBe(0);
	expect(view.fields.disabled).toBe(false);
	expect(view.status.textContent).toContain("受付を確認できませんでした");
	const retry = view.submit();
	view.finish(true);
	await retry;
	expect(view.events).toHaveLength(1);
});

test("does not submit invalid input", async () => {
	const view = contact();
	view.setValid(false);
	await view.submit();
	expect(view.requests).toHaveLength(0);
	expect(view.events).toHaveLength(0);
});

test("does not record an unacknowledged request after a network error", async () => {
	const view = contact();
	const pending = view.submit();
	view.fail();
	await pending;
	expect(view.events).toHaveLength(0);
	expect(view.resets()).toBe(0);
	expect(view.fields.disabled).toBe(false);
});
