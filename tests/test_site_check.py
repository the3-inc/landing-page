import importlib.util
import json
import re
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location(
    "site_check", Path(__file__).parents[1] / "scripts/site_check.py"
)
site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site)


class SiteCheckTest(unittest.TestCase):
    def setUp(self):
        self.files = {
            path: ("text/html", '<main id="main"></main>') for path in site.PAGES
        }
        self.files[site.PRODUCT + "demo/samples/lessons.json"] = (
            "application/json",
            json.dumps([{"id": "demand"}]),
        )
        self.files[site.PRODUCT] = (
            "text/html",
            '<main id="contact"></main><a href="demo/#demand">試す</a>'
            '<a href="docs/">文書</a>',
        )
        self.files["/products/"] = (
            "text/html",
            f'<a href="{site.PRODUCT}">製品紹介</a>',
        )
        self.files[site.PRODUCT + "demo/"] = (
            "text/html",
            '<a href="/products/schedula/">戻る</a>'
            '<a href="/products/schedula/#contact">相談</a><a href="../docs/">文書</a>'
            '<script src="/products/schedula/assets/app.js"></script>',
        )
        self.files[site.PRODUCT + "docs/"] = (
            "text/html",
            '<a href="/products/schedula/">戻る</a>'
            '<a href="/products/schedula/#contact">相談</a><a href="../demo/">試す</a>',
        )
        self.files[site.PRODUCT + "assets/app.js"] = ("text/javascript", "")

    def load(self, path):
        if path not in self.files:
            raise ValueError(path)
        return self.files[path]

    def test_round_trip_with_lesson_fragment_and_asset(self):
        self.assertEqual(site.check(self.load, "https://the3.co.jp"), 10)

    def test_same_site_links_preserve_the_origin_scheme(self):
        for origin, link, valid in (
            ("https://the3.co.jp", "http://the3.co.jp/company/", False),
            ("https://the3.co.jp", "http://the3.co.jp:80/company/", False),
            ("http://the3.co.jp", "https://the3.co.jp/company/", False),
            ("https://the3.co.jp", "https://the3.co.jp/company/", True),
            ("https://the3.co.jp", "https://THE3.CO.JP:443/company/", True),
            ("https://the3.co.jp:443", "https://the3.co.jp/company/", True),
            ("http://the3.co.jp", "http://the3.co.jp:80/company/", True),
            ("http://127.0.0.1:4322", "http://127.0.0.1:4322/company/", True),
            ("https://the3.co.jp", "//the3.co.jp/company/", True),
            ("http://the3.co.jp", "//the3.co.jp/company/", True),
        ):
            with self.subTest(origin=origin, link=link):
                self.files["/"] = ("text/html", f'<a href="{link}">会社</a>')
                if valid:
                    self.assertEqual(site.check(self.load, origin), 11)
                else:
                    with self.assertRaisesRegex(ValueError, "スキーム"):
                        site.check(self.load, origin)

    def test_explicit_default_port_does_not_skip_target_validation(self):
        for link in (
            "https://the3.co.jp:443/missing/",
            "https://THE3.CO.JP:443/company/#missing",
        ):
            with self.subTest(link=link):
                self.files["/"] = ("text/html", f'<a href="{link}">会社</a>')
                with self.assertRaisesRegex(ValueError, "missing"):
                    site.check(self.load, "https://the3.co.jp")

    def test_required_navigation_accepts_an_explicit_default_port(self):
        self.files["/products/"] = (
            "text/html",
            f'<a href="https://THE3.CO.JP:443{site.PRODUCT}">製品紹介</a>',
        )
        self.assertEqual(site.check(self.load, "https://the3.co.jp"), 10)

    def test_same_host_nonmatching_port_is_not_loaded_from_the_origin(self):
        for origin, link in (
            ("https://the3.co.jp", "https://the3.co.jp:8443/company/"),
            ("https://the3.co.jp:8443", "https://the3.co.jp/company/"),
            ("https://the3.co.jp", "https://the3.co.jp:0/company/"),
        ):
            with self.subTest(origin=origin, link=link):
                self.files["/"] = ("text/html", f'<a href="{link}">会社</a>')
                with self.assertRaisesRegex(ValueError, "ポート"):
                    site.check(self.load, origin)

    def test_required_navigation_cannot_be_removed(self):
        for source, href in (
            ("/products/", site.PRODUCT),
            (site.PRODUCT, "demo/#demand"),
            (site.PRODUCT, "docs/"),
            (site.PRODUCT + "demo/", site.PRODUCT),
            (site.PRODUCT + "demo/", site.PRODUCT + "#contact"),
            (site.PRODUCT + "demo/", "../docs/"),
            (site.PRODUCT + "docs/", site.PRODUCT),
            (site.PRODUCT + "docs/", site.PRODUCT + "#contact"),
            (site.PRODUCT + "docs/", "../demo/"),
        ):
            with self.subTest(source=source, href=href):
                original = self.files[source]
                self.files[source] = (
                    original[0],
                    re.sub(f'<a href="{re.escape(href)}">.*?</a>', "", original[1]),
                )
                with self.assertRaisesRegex(ValueError, "必須の導線"):
                    site.check(self.load, "https://the3.co.jp")
                self.files[source] = original

    def test_empty_pages_cannot_satisfy_navigation(self):
        for path in site.PAGES:
            self.files[path] = ("text/html", "<html></html>")
        with self.assertRaisesRegex(ValueError, "必須の導線"):
            site.check(self.load, "https://the3.co.jp")

    def test_missing_contact_lesson_asset_and_html_fallback_fail(self):
        for missing in ("contact", "lesson", "asset", "html-fallback"):
            with self.subTest(missing=missing):
                original = self.files.copy()
                if missing == "contact":
                    self.files[site.PRODUCT] = (
                        "text/html",
                        original[site.PRODUCT][1].replace('id="contact"', ""),
                    )
                elif missing == "lesson":
                    self.files[site.PRODUCT + "demo/samples/lessons.json"] = (
                        "application/json",
                        "[]",
                    )
                elif missing == "asset":
                    del self.files[site.PRODUCT + "assets/app.js"]
                else:
                    self.files[site.PRODUCT + "assets/app.js"] = (
                        "text/html",
                        "fallback",
                    )
                with self.assertRaises(ValueError):
                    site.check(self.load, "https://the3.co.jp")
                self.files = original

    def test_composition_rejects_overlap_and_symlinks(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            company, product, output = [
                root / name for name in ("company", "product", "output")
            ]
            for directory in (company, product, output):
                directory.mkdir()
            (company / "index.html").write_text("company")
            (product / "index.html").write_text("product")
            with self.assertRaisesRegex(ValueError, "重複"):
                site.compose(company, product, output)
            (product / "index.html").unlink()
            (product / "link").symlink_to(company / "index.html")
            with tempfile.TemporaryDirectory() as clean:
                with self.assertRaisesRegex(ValueError, "symlink"):
                    site.compose(company, product, Path(clean))


class HttpLoaderTest(unittest.TestCase):
    def test_canonical_pages_and_assets_do_not_follow_redirects(self):
        requested = []

        class Handler(BaseHTTPRequestHandler):
            status = 302

            def log_message(self, *args):
                pass

            def do_GET(self):
                requested.append(self.path)
                self.send_response(200 if self.path == "/" else self.status)
                self.send_header("Content-Type", "text/html")
                self.send_header("Location", "/")
                self.end_headers()
                self.wfile.write(b"<html>other page</html>")

        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
            worker = threading.Thread(target=server.serve_forever)
            worker.start()
            try:
                load = site.http_loader(f"http://127.0.0.1:{server.server_port}")
                self.assertIn("other page", load("/")[1])
                for path in (site.PRODUCT + "docs/", site.PRODUCT + "assets/app.js"):
                    for status in (301, 302, 303, 307, 308):
                        with self.subTest(path=path, status=status):
                            Handler.status = status
                            requested.clear()
                            with self.assertRaises(HTTPError) as caught:
                                load(path)
                            self.assertEqual(caught.exception.code, status)
                            self.assertEqual(requested, [path])
            finally:
                server.shutdown()
                worker.join()


if __name__ == "__main__":
    unittest.main()
