import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

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
            '<main id="contact"></main><a href="demo/#demand">試す</a>',
        )
        self.files[site.PRODUCT + "demo/"] = (
            "text/html",
            '<a href="/products/schedula/#contact">戻る</a><script src="/products/schedula/assets/app.js"></script>',
        )
        self.files[site.PRODUCT + "assets/app.js"] = ("text/javascript", "")

    def load(self, path):
        if path not in self.files:
            raise ValueError(path)
        return self.files[path]

    def test_round_trip_with_lesson_fragment_and_asset(self):
        self.assertEqual(site.check(self.load, "https://the3.co.jp"), 3)

    def test_missing_contact_lesson_asset_and_html_fallback_fail(self):
        for missing in ("contact", "lesson", "asset", "html-fallback"):
            with self.subTest(missing=missing):
                original = self.files.copy()
                if missing == "contact":
                    self.files[site.PRODUCT] = (
                        "text/html",
                        '<a href="demo/#demand">試す</a>',
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


if __name__ == "__main__":
    unittest.main()
