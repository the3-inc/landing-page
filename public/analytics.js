(() => {
	const id = document.currentScript.dataset.ga4Id;
	if (
		location.origin !== "https://the3.co.jp" ||
		!/^G-[A-Z0-9]+$/.test(id || "") ||
		window.gtag
	)
		return;

	window.dataLayer = window.dataLayer || [];
	window.gtag = function () {
		// biome-ignore lint/complexity/noArguments: Google tag's queue uses Arguments objects.
		window.dataLayer.push(arguments);
	};
	let referrer = "";
	if (document.referrer) {
		const url = new URL(document.referrer);
		referrer = url.origin + url.pathname;
	}
	// Query strings and fragments can contain contact details or demo input.
	window.gtag("set", {
		page_location: location.origin + location.pathname,
		page_referrer: referrer,
	});
	window.gtag("js", new Date());
	window.gtag("config", id, {
		allow_google_signals: false,
		allow_ad_personalization_signals: false,
	});
	const script = document.createElement("script");
	script.async = true;
	script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
	document.head.append(script);
})();
