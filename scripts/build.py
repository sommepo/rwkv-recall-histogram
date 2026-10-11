"""Package the add-on as dist/RWKV-Recall-Histogram.ankiaddon."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
FILES = (
    "__init__.py",
    "chart.css",
    "chart.js",
    "reviewer.js",
    "config.json",
    "config.md",
    "manifest.json",
)


def main() -> None:
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    target = dist / "RWKV-Recall-Histogram.ankiaddon"
    with ZipFile(target, "w", ZIP_DEFLATED) as archive:
        for name in FILES:
            # fixed timestamps, so the same source gives the same package
            info = ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, (ROOT / name).read_bytes())
    print(target)


if __name__ == "__main__":
    main()
