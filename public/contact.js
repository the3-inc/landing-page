(() => {
	const form = document.getElementById("contact-form");
	const fields = form.querySelector("fieldset");
	const status = document.getElementById("contact-status");
	let sending = false;
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (sending || !form.reportValidity()) return;
		const body = new FormData(form);
		sending = true;
		fields.disabled = true;
		form.setAttribute("aria-busy", "true");
		status.textContent = "送信しています。";
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 15000);
		try {
			const response = await fetch(form.action, {
				method: "POST",
				body,
				headers: { Accept: "application/json" },
				redirect: "error",
				signal: controller.signal,
			});
			if (!response.ok) throw new Error("Contact was not accepted");
		} catch {
			status.textContent =
				"受付を確認できませんでした。入力内容は残っています。時間をおいて再度お試しいただくか、メール・電話でお問い合わせください。";
			sending = false;
			fields.disabled = false;
			return;
		} finally {
			clearTimeout(timer);
			form.setAttribute("aria-busy", "false");
		}
		form.reset();
		status.textContent =
			"お問い合わせを受け付けました。ご連絡ありがとうございます。";
		// Keep the successful form disabled to prevent accidental duplicate submissions.
		window.gtag?.("event", "generate_lead", { form_id: "contact" });
	});
})();
