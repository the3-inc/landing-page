"""公開アーカイブを検証し、製品の共通CSSを版固定で取り込む。"""

import argparse
import hashlib
import io
import json
import re
import shutil
import tarfile
import tempfile
from pathlib import Path

FILES = {"package.json", "tokens.css", "base.css", "README.md"}
REPOSITORY = "the3-inc/landing-page"
LOCK = "preset.lock.json"
MAX_BYTES = 1024 * 1024


def digest(content):
    return hashlib.sha256(content).hexdigest()


def install(archive, sha256, destination):
    archive, destination = Path(archive), Path(destination)
    if not re.fullmatch(r"[a-f0-9]{64}", sha256):
        raise ValueError("SHA-256は小文字の16進数64文字で指定してください")
    if archive.stat().st_size > MAX_BYTES:
        raise ValueError("アーカイブが大きすぎます")
    raw = archive.read_bytes()
    if digest(raw) != sha256:
        raise ValueError("アーカイブのSHA-256が一致しません")
    contents = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as package:
        for member in package:
            name = member.name.removeprefix("package/")
            if (
                member.name != "package/" + name
                or name not in FILES
                or name in contents
                or not member.isfile()
                or member.size > MAX_BYTES
            ):
                raise ValueError("配布対象外のファイルがあります")
            contents[name] = package.extractfile(member).read()
    if set(contents) != FILES:
        raise ValueError("必要なファイルがありません")
    manifest = json.loads(contents["package.json"])
    version = manifest.get("version", "")
    if (
        manifest.get("name") != "@the3/brand-preset"
        or not re.fullmatch(r"\d+\.\d+\.\d+", version)
        or archive.name != f"the3-brand-preset-{version}.tgz"
    ):
        raise ValueError("パッケージ名・バージョン・ファイル名が一致しません")
    lock = {
        "package": manifest["name"],
        "version": version,
        "repository": REPOSITORY,
        "tag": f"brand-preset-v{version}",
        "archive": archive.name,
        "sha256": sha256,
        "files": {name: digest(content) for name, content in sorted(contents.items())},
    }
    if destination.is_symlink():
        raise ValueError("symlinkへは書き込みません")
    if destination.exists():
        if not destination.is_dir() or {
            p.name for p in destination.iterdir()
        } != FILES | {LOCK}:
            raise ValueError("既存の管理対象外ファイルは上書きしません")
        if (destination / LOCK).is_symlink():
            raise ValueError("固定情報のsymlinkは読み込みません")
        previous = json.loads((destination / LOCK).read_text())
        if (
            previous.get("package") != lock["package"]
            or set(previous.get("files", {})) != FILES
        ):
            raise ValueError("既存の固定情報が不正です")
        for name in FILES:
            path = destination / name
            if (
                path.is_symlink()
                or digest(path.read_bytes()) != previous["files"][name]
            ):
                raise ValueError("ローカルで変更されたプリセットは上書きしません")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="brand-preset-", dir=destination.parent
    ) as work:
        staging, backup = Path(work) / "next", Path(work) / "previous"
        staging.mkdir()
        for name, content in contents.items():
            (staging / name).write_bytes(content)
        (staging / LOCK).write_text(
            json.dumps(lock, ensure_ascii=False, indent=2) + "\n"
        )
        if destination.exists():
            destination.rename(backup)
        try:
            staging.rename(destination)
        except OSError:
            if backup.exists():
                shutil.move(backup, destination)
            raise
    return lock


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    result = install(args.archive, args.sha256, args.destination)
    print(f"{result['package']}@{result['version']} -> {args.destination}")


if __name__ == "__main__":
    main()
