"""Pack the published GOES-16 flash trace and the preceding ABI infrared scan."""

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from urllib.request import urlopen

import fitz
import h5py
import numpy as np
from PIL import Image
from pyproj import Proj

ROOT = Path(__file__).resolve().parents[1] / "src/app/megaflash"
PAPER = "https://ntrs.nasa.gov/api/citations/20250007235/downloads/BAMS-D-25-0037_R2-1.pdf"
SCAN = (
    "https://noaa-goes16.s3.amazonaws.com/ABI-L2-CMIPC/2017/295/08/"
    "OR_ABI-L2-CMIPC-M3C14_G16_s20172950852115_e20172950854488_c20172950854547.nc"
)
STATES = "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json"
BOUNDS = [-108.0, 26.0, -83.0, 46.0]


def retrieve(url, digest):
    with urlopen(url, timeout=40) as source:
        content = source.read()
    if sha256(content).hexdigest() != digest:
        raise ValueError(f"Source revision changed: {url}")
    return content


def flash_trace():
    source = retrieve(PAPER, "b3d5ea759918d9aee029feed154a74b7705b9ee88af574a27bf91d5513823302")
    with fitz.open(stream=source, filetype="pdf") as paper:
        figure = paper[3].get_images()[0][0]
        image = paper.extract_image(figure)["image"]
    pixels = np.asarray(Image.open(BytesIO(image)).convert("RGB"), dtype=np.float32)

    # Figure 1's colorbar runs upward from 0 ms at y=1087 to 7000 ms at y=225.
    # Discard grayscale clouds, black extent annotation, and red/blue ground-strike symbols.
    milliseconds = np.arange(0, 7400, 250)
    ramp = np.array([
        np.median(pixels[row-2:row+3, 1275:1285], axis=(0, 1))
        for row in np.minimum(1081, np.rint(1087 - milliseconds * (1087 - 225) / 7000)).astype(int)
    ])
    area = pixels[305:950, 405:840]
    r, g, b = area.transpose(2, 0, 1)
    y, x = np.nonzero((g - r >= 7) & (g - b >= 7) & (g >= 54))
    colors = area[y, x]
    distances = ((colors[:, None] - ramp) ** 2).sum(axis=2)
    bins = distances.argmin(axis=1)
    error = distances[np.arange(len(bins)), bins]

    # Keep the closest color in each small cell. This is a chart-derived trace, with
    # approximate times and holes where other plot marks cover the underlying trace.
    cells = {}
    for index in np.argsort(error):
        if error[index] > 100:
            break
        px, py = int(x[index]) + 405, int(y[index]) + 305
        lon = -99 + (px - 247) * 9 / (1044 - 247)
        lat = 39 - (py - 322) * 7.5 / (986 - 322)
        point = [int(milliseconds[bins[index]]), round(lon, 3), round(lat, 3)]
        cells.setdefault((px // 4, py // 4), point)
    trace = sorted(cells.values())
    if len(trace) < 800 or trace[0][0] != 0 or trace[-1][0] < 7000:
        raise ValueError("Incomplete lightning trace")
    return trace


def state_lines():
    topology = json.loads(retrieve(
        STATES, "d76b391ccfa8bff601d51e3e3da5d43a89fa46cd5caca72ce731b383be5596d0"
    ))
    scale_x, scale_y = topology["transform"]["scale"]
    base_x, base_y = topology["transform"]["translate"]
    west, south, east, north = BOUNDS
    lines = []
    for arc in topology["arcs"]:
        x = y = 0
        line = []
        for dx, dy in arc:
            x += dx
            y += dy
            lon, lat = x * scale_x + base_x, y * scale_y + base_y
            if west - 0.5 <= lon <= east + 0.5 and south - 0.5 <= lat <= north + 0.5:
                line.append([round(lon, 3), round(lat, 3)])
            else:
                if len(line) > 1:
                    lines.append(line)
                line = []
        if len(line) > 1:
            lines.append(line)
    return lines


def unpack(variable, selection):
    return variable[selection] * variable.attrs["scale_factor"][0] + variable.attrs["add_offset"][0]


def clouds():
    content = retrieve(SCAN, "080f3f3c413944134d2cb44e8084564b2800c880f61c1958c8b2c26c9505b9c4")
    with h5py.File(BytesIO(content)) as scan:
        grid = scan["goes_imager_projection"].attrs
        height = grid["perspective_point_height"][0]
        project = Proj(
            proj="geos", h=height, lon_0=grid["longitude_of_projection_origin"][0],
            a=grid["semi_major_axis"][0], b=grid["semi_minor_axis"][0], sweep="x",
        )
        west, south, east, north = BOUNDS
        lon, lat = np.meshgrid(np.linspace(west, east, 1380), np.linspace(north, south, 1360))
        u, v = project(lon, lat)
        x = unpack(scan["x"], slice(None))
        y = unpack(scan["y"], slice(None))
        cols = np.rint(np.interp(u / height, x, np.arange(x.size))).astype(int)
        rows = np.rint(np.interp(v / height, y[::-1], np.arange(y.size)[::-1])).astype(int)
        if cols.min() <= 0 or cols.max() >= x.size - 1 or rows.min() <= 0 or rows.max() >= y.size - 1:
            raise ValueError("Region falls outside the infrared scan")
        temp = unpack(scan["CMI"], np.s_[rows.min():rows.max()+1, cols.min():cols.max()+1])
        temp = temp[rows - rows.min(), cols - cols.min()]
        stops = [185, 214, 238, 260, 282, 305]
        palette = [(141, 155, 182), (89, 105, 142), (53, 64, 98), (31, 41, 66), (15, 24, 41), (8, 15, 27)]
        rgb = np.stack([np.interp(temp, stops, band) for band in zip(*palette)], axis=-1)
        # Feather the edges of the geographic crop as it tilts inside a wide viewport.
        u = np.linspace(-1, 1, rgb.shape[1])
        v = np.linspace(-1, 1, rgb.shape[0])
        fade = np.clip((1 - np.maximum(abs(u[None, :]), abs(v[:, None]))) / 0.16, 0, 1)
        alpha = 255 * fade * fade * (3 - 2 * fade)
        rgba = np.dstack([rgb, alpha]).astype("uint8")
        Image.fromarray(rgba).save(ROOT / "infrared.webp", quality=83, method=6)
        return scan.attrs["time_coverage_start"].decode()


if __name__ == "__main__":
    ROOT.mkdir(exist_ok=True)
    trace = flash_trace()
    data = {"bounds": BOUNDS, "trace": trace, "lines": state_lines(), "scan": clouds()}
    (ROOT / "flash.json").write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(f"Packed {len(trace)} chart samples and a GOES-16 infrared scan.")
