"""共有デザインだけを再現可能なNode.js互換tgzへまとめる。"""

import argparse
import gzip
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ("package.json", "tokens.css", "base.css", "assets/the3-symbol.svg", "README.md", "CHANGELOG.md", "LICENSE")
VERSION = r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"


def pack(destination, root=ROOT):
    package = root / "packages/brand"
    manifest = json.loads((package / "package.json").read_text())
    version = manifest["version"]
    if manifest["name"] != "@the3/brand" or not re.fullmatch(VERSION, version):
        raise ValueError("パッケージ名または版が不正です")
    if set(manifest["files"]) != set(FILES) - {"package.json"}:
        raise ValueError("配布ファイルの許可リストと一致しません")
    contents = {}
    for name in FILES:
        path = package / name
        if path.is_symlink() or not path.resolve().is_relative_to(package.resolve()):
            raise ValueError("パッケージ外のファイルは配布できません")
        contents[name] = path.read_bytes()
    git = lambda *args: subprocess.check_output(["git", *args], cwd=root, text=True).strip()
    metadata = {
        "repository": "the3-inc/landing-page",
        "tag": f"design-v{version}",
        "version": version,
        "source_commit": git("rev-parse", "HEAD"),
        "source_state": "working-tree" if git("status", "--porcelain", "--", "packages/brand") else "committed",
        "files": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(contents.items())},
    }
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise ValueError("空の出力先を指定してください")
    archive = destination / f"the3-brand-{version}.tgz"
    with archive.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=9) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as tar:
                for name, data in sorted(contents.items()):
                    info = tarfile.TarInfo(f"package/{name}")
                    info.size = len(data)
                    info.mode = 0o644
                    tar.addfile(info, io.BytesIO(data))
    metadata["archive_sha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
    release = destination / "release.json"
    release.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    sums = "".join(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n" for p in (archive, release))
    (destination / "SHA256SUMS").write_text(sums)
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    print(pack(parser.parse_args().destination))
