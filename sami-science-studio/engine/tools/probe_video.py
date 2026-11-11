#!/usr/bin/env python3
"""Probe a sample video: facts about the file, a contact sheet and a few full-size stills.

Usage:  python3 -I probe_video.py <video> --out <folder> [--frames 24] [--stills 4]
Needs ffmpeg and ffprobe on PATH. Writes probe.json, sheet.jpg and still_<t>s.jpg into the folder.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def run(cmd, timeout=300):
    return subprocess.run(cmd, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=timeout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", required=True)
    ap.add_argument("--frames", type=int, default=24)
    ap.add_argument("--stills", type=int, default=4)
    a = ap.parse_args()
    video, out = Path(a.video), Path(a.out)
    if not video.is_file():
        sys.exit(f"no such file: {video}")
    out.mkdir(parents=True, exist_ok=True)

    p = run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(video)])
    if p.returncode != 0:
        sys.exit("ffprobe could not read the file: " + p.stderr.strip()[-300:])
    info = json.loads(p.stdout)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    au = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    if v is None:
        sys.exit("the file has no video stream")
    duration = float(info["format"]["duration"])
    num, den = (v.get("r_frame_rate", "30/1").split("/") + ["1"])[:2]
    probe = {
        "file": video.name, "duration_s": round(duration, 3), "width": v["width"], "height": v["height"],
        "fps": round(float(num) / float(den or 1), 3),
        "aspect": "9:16" if v["height"] > v["width"] else ("1:1" if v["height"] == v["width"] else "16:9"),
        "audio": None,
    }
    if au is not None:
        vol = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-vn", "-af", "volumedetect,silencedetect=noise=-35dB:d=0.4", "-f", "null", "-"])
        mean = re.search(r"mean_volume: (-?[\d.]+) dB", vol.stderr)
        probe["audio"] = {
            "codec": au.get("codec_name"), "mean_volume_db": float(mean.group(1)) if mean else None,
            "silent_gaps": len(re.findall(r"silence_start", vol.stderr)),
            "speech_or_music": "not determined here: transcribe the audio to find out",
        }
    cuts = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-vf", "select='gt(scene,0.25)',showinfo", "-an", "-f", "null", "-"])
    probe["hard_cuts_s"] = [round(float(x), 2) for x in re.findall(r"pts_time:([\d.]+)", cuts.stderr)]

    cols = 4 if v["width"] > v["height"] else 6
    rows = -(-a.frames // cols)
    sheet = out / "sheet.jpg"
    r = run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-vf", f"fps={a.frames / duration},scale=320:-1,tile={cols}x{rows}", "-frames:v", "1", "-q:v", "3", str(sheet)])
    if r.returncode != 0:
        sys.exit("ffmpeg could not make the contact sheet: " + r.stderr.strip()[-300:])
    probe["sheet"] = {"file": sheet.name, "frames": a.frames, "seconds_between_frames": round(duration / a.frames, 2)}
    probe["stills"] = []
    for i in range(a.stills):
        t = round(duration * (i + 0.5) / a.stills, 1)
        f = out / f"still_{t}s.jpg"
        run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(video), "-frames:v", "1", "-q:v", "3", str(f)])
        probe["stills"].append(f.name)
    (out / "probe.json").write_text(json.dumps(probe, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(probe, indent=1))


if __name__ == "__main__":
    main()
