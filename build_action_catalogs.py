from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path


DEFAULT_CATALOG = {
    "id": "default",
    "label": "Catalogue principal",
    "path": "actions_selection.csv",
}
CATALOGS_SUBDIR = "fiches actions - catalogues types"
OUTPUT_FILENAME = "action-catalogs.json"


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip())
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", normalized.lower())
    normalized = normalized.strip("-")
    return normalized or "catalog"


def build_catalog_entries(base_dir: Path) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = [dict(DEFAULT_CATALOG)]
    catalogs_dir = base_dir / CATALOGS_SUBDIR

    if not catalogs_dir.exists():
        return entries

    for csv_path in sorted(catalogs_dir.glob("*.csv"), key=lambda path: path.name.lower()):
        relative_path = csv_path.relative_to(base_dir).as_posix()
        entries.append(
            {
                "id": slugify(csv_path.stem),
                "label": csv_path.stem,
                "path": relative_path,
            }
        )

    return entries


def write_catalog_manifest(base_dir: Path) -> Path:
    output_path = base_dir / OUTPUT_FILENAME
    payload = build_catalog_entries(base_dir)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate action-catalogs.json from catalog CSV files."
    )
    parser.add_argument(
        "directories",
        nargs="*",
        default=[".", "public"],
        help="Base directories to scan and update.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    for raw_dir in args.directories:
        base_dir = Path(raw_dir).resolve()
        if not base_dir.exists():
            print(f"[skip] Missing directory: {base_dir}")
            continue

        output_path = write_catalog_manifest(base_dir)
        print(f"[ok] Wrote {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
