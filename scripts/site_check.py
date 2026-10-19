"""会社・製品の生成物または公開URLの静的な接続を検査する。"""

import argparse
import json
import mimetypes
import shutil
import tempfile
from functools import partial
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, build_opener, urlopen

PRODUCT = "/products/schedula/"
PAGES = (
    "/",
    "/company/",
    "/contact/",
    "/products/",
    PRODUCT,
    PRODUCT + "demo/",
    PRODUCT + "docs/",
)


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.links, self.ids = [], set()
        self.feed(text)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if "id" in attrs:
            self.ids.add(attrs["id"])
        for name in ("href", "src"):
            if name in attrs:
                self.links.append(attrs[name])


def check(load, origin):
    cache = {}

    def get(path):
        if path not in cache:
            cache[path] = load(path)
        return cache[path]

    lessons = {
        item["id"] for item in json.loads(get(PRODUCT + "demo/samples/lessons.json")[1])
    }
    references = 0
    for path in PAGES:
        media, text = get(path)
        if "text/html" not in media:
            raise ValueError(f"HTMLではありません: {path}")
        for link in Page(text).links:
            target = urlsplit(urljoin(origin + path, link))
            if (
                target.scheme not in {"http", "https"}
                or target.netloc != urlsplit(origin).netloc
            ):
                continue
            target_media, content = get(target.path)
            if (
                Path(target.path).suffix not in {"", ".html"}
                and "text/html" in target_media
            ):
                raise ValueError(f"ファイルの代わりにHTMLが返りました: {target.path}")
            if target.fragment:
                ids = Page(content).ids
                if target.path == PRODUCT + "demo/":
                    ids |= lessons
                if unquote(target.fragment) not in ids:
                    raise ValueError(f"遷移先がありません: {path} -> {link}")
            references += 1
    return references


def compose(company, product, destination):
    for root in (company, product):
        for source in root.rglob("*"):
            if source.is_symlink():
                raise ValueError(f"生成物にsymlinkがあります: {source}")
            if source.is_file():
                target = destination / source.relative_to(root)
                if target.exists():
                    raise ValueError(
                        f"会社と製品の出力が重複しています: {target.relative_to(destination)}"
                    )
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)


def local_loader(root):
    def load(path):
        target = root / unquote(path).lstrip("/")
        if path.endswith("/"):
            target /= "index.html"
        if not target.resolve().is_relative_to(root.resolve()) or not target.is_file():
            raise ValueError(f"ファイルがありません: {path}")
        media = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        return media, target.read_bytes().decode("utf-8", errors="replace")

    return load


class Preview(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path in (PRODUCT + "demo", PRODUCT + "docs"):
            self.send_response(308)
            self.send_header("Location", path + "/")
            self.end_headers()
            return
        super().do_GET()


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", help="公開URLを検査する（APIの計算は実行しない）")
    parser.add_argument("--company", type=Path, help="会社サイトの生成先")
    parser.add_argument(
        "--product", type=Path, help="製品の生成先（products/を含むroot）"
    )
    parser.add_argument(
        "--serve", action="store_true", help="検査後、127.0.0.1で静的プレビュー"
    )
    parser.add_argument("--port", type=int, default=4322)
    args = parser.parse_args()
    if args.url:
        if args.company or args.product or args.serve:
            parser.error("--urlとローカル生成物・--serveは同時指定できません")
        origin = args.url.rstrip("/")
        parsed = urlsplit(origin)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path:
            parser.error("--urlにはhttp(s)のoriginを指定してください")

        def load(path):
            with urlopen(origin + path, timeout=15) as response:
                return response.headers.get("Content-Type", ""), response.read().decode(
                    "utf-8", errors="replace"
                )

        references = check(load, origin)
        for name in ("demo", "docs"):
            source = origin + PRODUCT + name
            try:
                build_opener(NoRedirect).open(source, timeout=15).close()
            except HTTPError as error:
                if (
                    error.code == 308
                    and urljoin(source, error.headers.get("Location", ""))
                    == source + "/"
                ):
                    continue
                raise ValueError(f"末尾slashが308で補完されません: {name}") from error
            raise ValueError(f"末尾slashが補完されません: {name}")
        try:
            load(PRODUCT + "docs/__site_check_missing__.md")
        except HTTPError as error:
            if error.code not in {403, 404}:
                raise
        else:
            raise ValueError("存在しない文書が成功応答になりました")
        print(
            f"7ページ、同一サイト内の参照{references}件、URL補完と未知の文書を検証しました"
        )
        return
    if not args.company or not args.product:
        parser.error("--companyと--product、または--urlを指定してください")
    for root in (args.company, args.product):
        if not root.is_dir():
            parser.error(f"生成先がありません: {root}")
    with tempfile.TemporaryDirectory(prefix="product-web-preview-") as directory:
        root = Path(directory)
        compose(args.company, args.product, root)
        references = check(local_loader(root), "https://the3.co.jp")
        print(f"7ページ、同一サイト内の参照{references}件を検証しました", flush=True)
        if args.serve:
            with ThreadingHTTPServer(
                ("127.0.0.1", args.port), partial(Preview, directory=str(root))
            ) as server:
                print(
                    f"http://127.0.0.1:{server.server_port}/ （静的確認のみ。APIは別途検証）",
                    flush=True,
                )
                server.serve_forever()


if __name__ == "__main__":
    main()
