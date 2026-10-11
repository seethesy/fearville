"""Regenerate the iPhone Night Rite guide diagrams from lib/tutorials/diagrams.ts.

Writes one vector PDF image set per diagram into ios/Fearville/Assets.xcassets.
Requires Node 22+ and CairoSVG (pip install cairosvg). Run from the repo root:

    python scripts/generate-rite-diagrams.py
"""
import json
import pathlib
import subprocess

import cairosvg

ROOT = pathlib.Path(__file__).resolve().parent.parent
dump = subprocess.run(
    [
        "node",
        "--experimental-strip-types",
        "--no-warnings",
        "--input-type=module",
        "-e",
        "import { RITE_DIAGRAMS, iosDiagramAsset } from './lib/tutorials/diagrams.ts';"
        "console.log(JSON.stringify(Object.entries(RITE_DIAGRAMS).map(([k, svg]) => [iosDiagramAsset(k), svg])));",
    ],
    cwd=ROOT,
    check=True,
    capture_output=True,
    text=True,
).stdout
catalog = ROOT / "ios" / "Fearville" / "Assets.xcassets"
for name, svg in json.loads(dump):
    folder = catalog / f"{name}.imageset"
    folder.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2pdf(bytestring=svg.encode(), write_to=str(folder / f"{name}.pdf"))
    (folder / "Contents.json").write_text(
        json.dumps(
            {
                "images": [{"filename": f"{name}.pdf", "idiom": "universal"}],
                "info": {"author": "xcode", "version": 1},
                "properties": {"preserves-vector-representation": True},
            },
            indent=2,
        )
        + "\n"
    )
    print("wrote", folder.relative_to(ROOT))
