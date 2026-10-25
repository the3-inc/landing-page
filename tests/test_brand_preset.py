import hashlib
import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "install_brand_preset",
    Path(__file__).parents[1] / "scripts/install_brand_preset.py",
)
preset = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preset)


class InstallPresetTest(unittest.TestCase):
    def setUp(self):
        self.work = tempfile.TemporaryDirectory()
        self.addCleanup(self.work.cleanup)
        self.root = Path(self.work.name)
        self.destination = self.root / "vendor" / "brand-preset"

    def archive(self, version="0.1.0", extra=None):
        path = self.root / f"the3-brand-preset-{version}.tgz"
        files = {
            "package.json": json.dumps(
                {"name": "@the3/brand-preset", "version": version}
            ).encode(),
            "tokens.css": b":root { --the3-accent: #087f83; }",
            "base.css": b'@import "./tokens.css";',
            "README.md": b"brand-preset",
        }
        with tarfile.open(path, "w:gz") as archive:
            for name, content in files.items():
                info = tarfile.TarInfo("package/" + name)
                info.size = len(content)
                archive.addfile(info, io.BytesIO(content))
            if extra:
                archive.addfile(extra, io.BytesIO(b""))
        return path, hashlib.sha256(path.read_bytes()).hexdigest()

    def test_installs_and_updates_with_version_and_file_hashes(self):
        for version in ("0.1.0", "0.1.1"):
            path, digest = self.archive(version)
            lock = preset.install(path, digest, self.destination)
            self.assertEqual(lock["version"], version)
            self.assertEqual(lock["tag"], "brand-preset-v" + version)
            self.assertEqual(lock["sha256"], digest)
            self.assertEqual(set(lock["files"]), preset.FILES)
            self.assertEqual(
                json.loads((self.destination / preset.LOCK).read_text()), lock
            )

    def test_rejects_corruption_before_writing(self):
        path, _ = self.archive()
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            preset.install(path, "0" * 64, self.destination)
        self.assertFalse(self.destination.exists())

    def test_rejects_paths_links_and_duplicate_members(self):
        for name, kind in (
            ("../outside", tarfile.REGTYPE),
            ("package/base.css", tarfile.SYMTYPE),
            ("package/tokens.css", tarfile.REGTYPE),
        ):
            extra = tarfile.TarInfo(name)
            extra.type = kind
            extra.linkname = "../outside"
            path, digest = self.archive(extra=extra)
            with self.subTest(name=name, kind=kind), self.assertRaises(ValueError):
                preset.install(path, digest, self.destination)
        self.assertFalse(self.destination.exists())

    def test_rejects_wrong_version_filename(self):
        path, digest = self.archive()
        renamed = path.with_name("the3-brand-preset-0.2.0.tgz")
        path.rename(renamed)
        with self.assertRaises(ValueError):
            preset.install(renamed, digest, self.destination)

    def test_preserves_unmanaged_and_modified_files(self):
        path, digest = self.archive()
        self.destination.mkdir(parents=True)
        custom = self.destination / "custom.css"
        custom.write_text("keep")
        with self.assertRaises(ValueError):
            preset.install(path, digest, self.destination)
        self.assertEqual(custom.read_text(), "keep")
        custom.unlink()
        self.destination.rmdir()
        preset.install(path, digest, self.destination)
        target = self.destination / "base.css"
        target.write_text("local edit")
        with self.assertRaisesRegex(ValueError, "ローカル"):
            preset.install(path, digest, self.destination)
        self.assertEqual(target.read_text(), "local edit")

    def test_rollback_restores_previous_install_if_swap_fails(self):
        from unittest.mock import patch

        path, digest = self.archive()
        previous = preset.install(path, digest, self.destination)
        path, digest = self.archive("0.1.1")
        rename = Path.rename

        def fail_staging(path, target):
            if path.name == "next":
                raise OSError("simulated disk error")
            return rename(path, target)

        with patch.object(Path, "rename", fail_staging), self.assertRaises(OSError):
            preset.install(path, digest, self.destination)
        self.assertEqual(
            json.loads((self.destination / preset.LOCK).read_text()), previous
        )
