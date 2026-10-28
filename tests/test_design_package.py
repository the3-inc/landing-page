"""配布物の再現性・許可リスト・リリース条件を検証する。"""

import hashlib
import importlib.util
import json
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DesignPackageTest(unittest.TestCase):
    def test_archive_is_reproducible_allowlisted_and_matches_the_workspace(self):
        packer = load("pack_design")
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            first = packer.pack(directory / "a")
            second = packer.pack(directory / "b")
            self.assertEqual(first.read_bytes(), second.read_bytes())
            release = json.loads((first.parent / "release.json").read_text())
            self.assertEqual(release["archive_sha256"], hashlib.sha256(first.read_bytes()).hexdigest())
            with tarfile.open(first) as tar:
                self.assertEqual(set(tar.getnames()), {f"package/{name}" for name in packer.FILES})
                for member in tar.getmembers():
                    self.assertTrue(member.isfile())
                    name = member.name.removeprefix("package/")
                    content = tar.extractfile(member).read()
                    self.assertEqual(content, (ROOT / "packages/brand" / name).read_bytes())
                    self.assertEqual(release["files"][name], hashlib.sha256(content).hexdigest())
            with self.assertRaises(ValueError):
                packer.pack(first.parent)

    def test_compatibility_logo_is_generated_from_package_source(self):
        source = ROOT / "packages/brand/assets/the3-symbol.svg"
        public = ROOT / "public/brand/the3-symbol.svg"
        self.assertEqual(source.read_bytes(), public.read_bytes())

    def test_design_tags_require_matching_version_and_main_ancestry(self):
        verify = load("verify_design_release").verify
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=directory, text=True).strip()
            git("init", "--initial-branch=main")
            git("config", "user.name", "Test")
            git("config", "user.email", "test@example.invalid")
            package = directory / "packages/brand"
            package.mkdir(parents=True)
            (package / "package.json").write_text(json.dumps({"name": "@the3/brand", "version": "1.0.0"}))
            git("add", ".")
            git("-c", "commit.gpgsign=false", "commit", "-m", "Initial")
            git("update-ref", "refs/remotes/origin/main", "HEAD")
            git("tag", "design-v1.0.0")
            self.assertEqual(verify("design-v1.0.0", directory), git("rev-parse", "HEAD"))
            for tag in ("v1.0.0", "design-v01.0.0", "design-v1.0.0\n", "--help"):
                with self.assertRaises(ValueError):
                    verify(tag, directory)
            git("tag", "design-v2.0.0")
            with self.assertRaises(ValueError):
                verify("design-v2.0.0", directory)
            git("switch", "-c", "unmerged")
            git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Unmerged")
            git("tag", "design-v1.0.1")
            with self.assertRaises(subprocess.CalledProcessError):
                verify("design-v1.0.1", directory)


if __name__ == "__main__":
    unittest.main()
