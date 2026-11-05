"""Pack GOES-17 crops and ASOS pressure for the 15 January 2022 replay."""

import csv
import datetime as dt
import io
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from xml.etree import ElementTree as ET

import fsspec
import h5py
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / "src/app/tonga"
GOES = "https://noaa-goes17.s3.amazonaws.com/"
ASOS = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos1min.py"
DATE = "2022-01-15"
LON, LAT = -175.387, -20.536
WIDTH, HEIGHT, COLUMNS = 640, 368, 2


def retrieve(url):
    with urlopen(url, timeout=40) as response:
        return response.read()


def scan_keys(band):
    keys = []
    for hour in ("03", "04", "05", "06"):
        prefix = f"ABI-L2-CMIPF/2022/015/{hour}/OR_ABI-L2-CMIPF-M6C{band}"
        index = ET.fromstring(retrieve(GOES + "?" + urlencode({"list-type": 2, "prefix": prefix})))
        keys.extend(row.findtext("{*}Key") for row in index.findall("{*}Contents"))
    return {
        int(key.split("_s2022015")[1][:2]) * 60 + int(key.split("_s2022015")[1][2:4]): key
        for key in keys
    }


def unpack(var, selection):
    return var[selection].astype("float32") * var.attrs["scale_factor"][0] + var.attrs["add_offset"][0]


def scan_crop(key, size):
    with fsspec.open(GOES + key, "rb", block_size=524288) as stream, h5py.File(stream) as scan:
        p = scan["goes_imager_projection"].attrs
        a, b = p["semi_major_axis"][0], p["semi_minor_axis"][0]
        lat = math.radians(LAT)
        lam = math.radians(LON - p["longitude_of_projection_origin"][0])
        n = a / math.sqrt(1 - (1 - b**2 / a**2) * math.sin(lat)**2)
        x = p["perspective_point_height"][0] + a - n * math.cos(lat) * math.cos(lam)
        y = n * math.cos(lat) * math.sin(lam)
        z = n * (b / a)**2 * math.sin(lat)
        x_scan = math.asin(y / math.sqrt(x*x + y*y + z*z))
        y_scan = math.atan2(z, x)
        col = int(np.argmin(abs(unpack(scan["x"], slice(None)) - x_scan)))
        row = int(np.argmin(abs(unpack(scan["y"], slice(None)) - y_scan)))
        w, h = size
        box = np.s_[row - h//2:row + h//2, col - w//2:col + w//2]
        values = unpack(scan["CMI"], box)
        if values.shape != (h, w):
            raise ValueError(f"Unexpected GOES crop for {key}")
        stamp = scan.attrs["time_coverage_start"].decode()
        return values, stamp


def color(values, stops, palette):
    channels = [np.interp(values, stops, channel) for channel in zip(*palette)]
    return Image.fromarray(np.uint8(np.stack(channels, axis=-1))).resize(
        (WIDTH, HEIGHT), Image.Resampling.LANCZOS
    )


def pack_satellite(band, name, minutes, size, stops, palette, difference=False):
    keys = scan_keys(band)
    scans = [minutes[0] - 10, *minutes] if difference else minutes
    with ThreadPoolExecutor(max_workers=4) as executor:
        data = list(executor.map(lambda minute: scan_crop(keys[minute], size), scans))
    atlas = Image.new("RGB", (WIDTH * COLUMNS, HEIGHT * math.ceil(len(minutes) / COLUMNS)))
    frames = []
    for i, minute in enumerate(minutes):
        current, stamp = data[i + int(difference)]
        values = current - data[i][0] if difference else current
        tile = color(values, stops, palette)
        atlas.paste(tile, (i % COLUMNS * WIDTH, i // COLUMNS * HEIGHT))
        frames.append({"minute": minute, "at": stamp, "file": keys[minute]})
    result = ROOT / f"{name}.webp"
    atlas.save(result, "WEBP", quality=83, method=6)
    print(f"{result.name}: {len(frames)} scans, {result.stat().st_size:,} bytes", flush=True)
    return frames


def minutes(clock):
    hour, minute = map(int, clock.split(":"))
    return hour * 60 + minute


def pressure(station, name, start, peak):
    first = minutes(start)
    last = first + 100
    end = f"{last // 60:02}:{last % 60:02}"
    query = urlencode({
        "station": station, "vars": "pres1", "sts": f"{DATE}T{start}Z",
        "ets": f"{DATE}T{end}Z", "sample": "1min", "what": "download",
        "tz": "UTC", "gis": "yes", "delim": "comma",
    })
    url = ASOS + "?" + query
    rows = list(csv.DictReader(io.StringIO(retrieve(url).decode())))
    readings = {}
    for row in rows:
        if row["pres1"] in ("", "M"):
            continue
        stamp = dt.datetime.fromisoformat(row["valid(UTC)"])
        minute = stamp.hour * 60 + stamp.minute
        # Retain the source thousandths of an inch of mercury for exact reproduction.
        readings[minute] = round(float(row["pres1"]) * 1000)
    values = [readings.get(minute) for minute in range(first, last)]
    if sum(v is not None for v in values) < 90 or readings.get(minutes(peak)) is None:
        raise ValueError(f"Missing pressure readings around the pulse at {station}")
    return {
        "id": station, "name": name, "lat": float(rows[0]["lat"]), "lon": float(rows[0]["lon"]),
        "start": first, "peak": minutes(peak), "values": values, "source": url,
    }


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    infrared = pack_satellite(
        "13", "infrared", list(range(240, 321, 10)), (640, 368),
        (180, 205, 225, 250, 280, 305),
        [(253, 246, 232), (216, 221, 238), (157, 179, 203), (81, 111, 143), (23, 45, 68), (9, 22, 39)],
    )
    vapor = pack_satellite(
        "08", "water-vapor", list(range(290, 401, 10)), (1500, 862),
        (-7, -2, 0, 2, 7),
        [(239, 218, 180), (137, 113, 93), (32, 53, 72), (84, 136, 163), (207, 237, 247)],
        difference=True,
    )
    stations = [
        pressure("PHNL", "Honolulu", "08:15", "08:59"),
        pressure("SFO", "San Francisco", "11:10", "12:03"),
        pressure("PANC", "Anchorage", "12:05", "12:51"),
    ]
    bundle = {
        "date": DATE, "width": WIDTH, "height": HEIGHT, "columns": COLUMNS,
        "infrared": infrared, "vapor": vapor, "stations": stations,
    }
    (ROOT / "tonga.json").write_text(json.dumps(bundle, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
