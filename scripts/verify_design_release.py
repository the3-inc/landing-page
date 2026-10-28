"""既存designタグ・mainへの包含・パッケージ版の一致を確認する。"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def verify(tag, root=ROOT):
    if not re.fullmatch(r"design-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", tag):
        raise ValueError("design-vMAJOR.MINOR.PATCH形式の既存タグを指定してください")
    git = lambda *args: subprocess.check_output(["git", *args], cwd=root, text=True).strip()
    sha = git("rev-parse", "--verify", f"refs/tags/{tag}^{{commit}}")
    git("merge-base", "--is-ancestor", sha, "refs/remotes/origin/main")
    manifest = json.loads(git("show", f"{sha}:packages/brand/package.json"))
    if manifest["name"] != "@the3/brand" or tag != f"design-v{manifest['version']}":
        raise ValueError("タグとパッケージの版が一致しません")
    return sha


if __name__ == "__main__":
    print(verify(sys.argv[1]))
