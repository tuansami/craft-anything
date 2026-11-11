#!/usr/bin/env python3
"""Create a video project from the template.

Usage:  python3 -I new_project.py <target folder> --id <slug> --title "<title>" [--channel pure-science]
                                  [--style <pack>] [--format 9x16|16x9|1x1]
The style and wordmark default to the channel profile's.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASPECT = {"9x16": "9:16", "16x9": "16:9", "1x1": "1:1"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target")
    ap.add_argument("--id", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--channel", default="pure-science")
    ap.add_argument("--style")
    ap.add_argument("--format", choices=sorted(ASPECT))
    a = ap.parse_args()
    target = Path(a.target)
    if target.exists() and any(target.iterdir()):
        sys.exit(f"{target} already exists and is not empty")
    profile = ROOT / "channels" / f"{a.channel}.json"
    if not profile.is_file():
        sys.exit(f"no channel profile {profile.name}; have: {', '.join(p.stem for p in (ROOT / 'channels').glob('*.json'))}")
    channel = json.loads(profile.read_text(encoding="utf-8"))
    style = a.style or channel["style"]["pack"]
    if not (ROOT / "engine" / "styles" / f"{style}.json").is_file():
        sys.exit(f"no style pack '{style}' in engine/styles")
    fmt = a.format or channel["formats"]["primary"]
    shutil.copytree(ROOT / "templates" / "project", target, dirs_exist_ok=True)
    fill = {"__ID__": a.id, "__TITLE__": a.title.replace('"', "'"), "__CHANNEL__": a.channel, "__STYLE__": style,
            "__FORMAT__": fmt, "__ASPECT__": ASPECT[fmt], "__WORDMARK__": channel["wordmark"]}
    for f in list(target.rglob("*.json")) + list(target.rglob("*.js")):
        s = f.read_text(encoding="utf-8")
        for k, v in fill.items():
            s = s.replace(k, v)
        f.write_text(s, encoding="utf-8")
    for keep in target.rglob(".gitkeep"):
        keep.unlink()
    print(target)


if __name__ == "__main__":
    main()
