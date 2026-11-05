"""Pack the USGS lava chronology, historic shoreline, and reference relief."""

from datetime import datetime
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from subprocess import run
from tempfile import TemporaryDirectory
from urllib.parse import urlencode
from urllib.request import urlopen
from zipfile import ZipFile

import numpy as np
from PIL import Image
from pyproj import Transformer
import shapefile
from shapely import make_valid, union_all
from shapely.geometry import box, shape
from shapely.geometry.polygon import orient
from shapely.ops import transform


ROOT = Path(__file__).resolve().parents[1] / "src/app/kilauea"
ZIP = (
    "https://www.sciencebase.gov/catalog/file/get/5eba3f6082ce25b5135d5b85"
    "?f=__disk__ec%2F1d%2F24%2Fec1d2475fef61d92fc624d784c40b51df0cfb21f"
)
ZIP_SHA = "6216a57ee183fb9cdc3100833ef6d0fe2dd61b912c35a06b9ea83b6b7525fdfe"
COAST = "https://geodata.hawaii.gov/arcgis/rest/services/Terrestrial/MapServer/3/query"
RELIEF = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
FLIGHT = (
    "https://usgs-ocapsv2-public-input-media.s3.us-west-2.amazonaws.com"
    "/assets/palladium/production/s3fs-public/atoms/video/multimediaFile-2171.mp4"
)
FLIGHT_SHA = "23b62ae3544f5a0013b9662f9ee9bab8f4cb8b69eee884e863e9891df2e8d2ed"
ORIGIN = (300000, 2155000)
BOUNDS = (279000, 2137000, 331000, 2183000)
TILE_SIZE = (2080, 1840)
DATES = [
    "05/28 07:00", "05/28 13:15", "05/29 18:00", "05/30 21:00", "05/31 20:00",
    "06/01 22:00", "06/03 01:00", "06/03 18:00", "06/04 12:30", "06/04 22:00",
    "06/07 11:00", "06/14 22:00", "07/05 01:00", "07/25 09:00", "08/09 01:00",
]
REGION = box(*BOUNDS)
TO_UTM = Transformer.from_crs(4326, 26905, always_xy=True).transform


def download(url, params=None):
    if params:
        url += "?" + urlencode(params)
    with urlopen(url, timeout=60) as response:
        return response.read()


def entries(archive, directory, layer):
    prefix = f"{directory}/KIL_2018_LERZ_{layer}"
    shp = BytesIO(archive.read(prefix + ".shp"))
    dbf = BytesIO(archive.read(prefix + ".dbf"))
    for row in shapefile.Reader(shp=shp, dbf=dbf, encoding="latin1").iterShapeRecords():
        yield row.record, make_valid(shape(row.shape.__geo_interface__))


def components(geometry, kind):
    if geometry.is_empty:
        return
    if geometry.geom_type == kind:
        yield geometry
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from components(part, kind)


def points(sequence):
    return [[round(x - ORIGIN[0]), round(y - ORIGIN[1])] for x, y in sequence]


def polygons(geometry):
    rings = []
    for polygon in components(geometry.simplify(8, preserve_topology=True), "Polygon"):
        if polygon.area < 90:
            continue
        polygon = orient(polygon)
        rings.append([points(polygon.exterior.coords), *[points(ring.coords) for ring in polygon.interiors]])
    return rings


def lines(geometry):
    return [
        points(part.coords)
        for part in components(geometry.simplify(8, preserve_topology=True), "LineString") if part.length >= 15
    ]


def baseline():
    source = json.loads(download(COAST, {
        "where": "isle='Hawaii' AND water=0", "f": "geojson", "outSR": 4326,
        "outFields": "isle", "geometryPrecision": 6,
    }))
    if len(source["features"]) != 1:
        raise ValueError("Expected a single Hawaiʻi island shoreline")
    return make_valid(transform(TO_UTM, shape(source["features"][0]["geometry"])))


def make_relief():
    raw = download(RELIEF, {
        "bbox": ",".join(map(str, BOUNDS)), "bboxSR": 26905, "imageSR": 26905,
        "f": "image", "size": ",".join(map(str, TILE_SIZE)), "format": "png32",
        "adjustAspectRatio": "false", "renderingRule": json.dumps({"rasterFunction": "Hillshade Gray"}),
    })
    im = Image.open(BytesIO(raw)).convert("L")
    if im.size != TILE_SIZE:
        raise ValueError("Unexpected relief grid size")
    shade = np.asarray(im)
    palette = [(12, 22, 25), (27, 45, 46), (51, 68, 66), (107, 112, 100)]
    tinted = [np.interp(shade, (20, 110, 185, 255), channel) for channel in zip(*palette)]
    Image.fromarray(np.uint8(np.stack(tinted, axis=-1))).save(
        ROOT / "relief.webp", "WEBP", quality=83, method=6
    )


def make_overflight():
    source = download(FLIGHT)
    if sha256(source).hexdigest() != FLIGHT_SHA:
        raise ValueError("Unexpected revision of the HVO helicopter footage")
    w, h, cols, count, fps = 640, 360, 4, 16, 5
    with TemporaryDirectory() as temp:
        file = Path(temp) / "kapoho.mp4"
        file.write_bytes(source)
        raw = run([
            "ffmpeg", "-v", "error", "-ss", "14.5", "-i", str(file), "-vf", f"fps={fps},scale={w}:{h}",
            "-frames:v", str(count), "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
        ], capture_output=True, check=True).stdout
    size = w * h * 3
    if len(raw) != count * size:
        raise ValueError("Incomplete HVO footage extract")
    atlas = Image.new("RGB", (cols * w, (count // cols) * h))
    for i in range(count):
        frame = Image.frombytes("RGB", (w, h), raw[i * size:(i + 1) * size])
        atlas.paste(frame, (i % cols * w, i // cols * h))
    atlas.save(ROOT / "ocean-entry.webp", "WEBP", quality=78, method=6)
    return {"width": w, "height": h, "columns": cols, "count": count, "fps": fps}


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    raw = download(ZIP)
    if sha256(raw).hexdigest() != ZIP_SHA:
        raise ValueError("Unexpected revision of the USGS map archive")
    archive = ZipFile(BytesIO(raw))
    island = baseline()
    shore = island.intersection(REGION)
    coast = island.boundary.intersection(REGION)
    fissures = union_all([g for row, g in entries(archive, "Eruption", "FissureLines") if row["Fissure"] == "08"])
    vent = points([(fissures.centroid.x, fissures.centroid.y)])[0]
    dated = sorted(
        [(row["FlowTime1"], g) for row, g in entries(archive, "Eruption", "FlowChronologyPolys")],
        key=lambda entry: entry[0],
    )
    f8 = union_all([g for _, g in entries(archive, "IndividualFlows", "Fissure08FlowB")])
    changed = f8.difference(shore).envelope.buffer(300).intersection(REGION)
    shared_coast = coast.difference(changed)
    former_coast = coast.intersection(changed)
    previous = None
    snapshots = []
    for date in DATES:
        stamp = f"2018/{date}:00"
        if not any(t == stamp for t, _ in dated):
            raise ValueError(f"Missing published map for {stamp}")
        flow = union_all([g for t, g in dated if t <= stamp], grid_size=0.5)
        fresh = flow if previous is None else flow.difference(previous, grid_size=0.5)
        mapped_f8 = union_all(list(components(flow.intersection(f8, grid_size=0.5), "Polygon")))
        delta = mapped_f8.difference(shore, grid_size=0.5)
        if date == "06/03 18:00" and delta.area > 1000:
            raise ValueError("Kapoho delta appears before ocean entry")
        if date == "06/04 22:00" and delta.area < 50_000:
            raise ValueError("First mapped Kapoho entry is missing")
        outline = shore.union(delta, grid_size=0.5).boundary.intersection(changed)
        snapshots.append({
            "at": datetime.strptime(stamp, "%Y/%m/%d %H:%M:%S").isoformat(timespec="minutes") + "-10:00",
            "fresh": polygons(fresh),
            "delta": polygons(delta),
            "coast": lines(outline),
        })
        previous = flow
    if delta.area < 3_000_000:
        raise ValueError("Final Kapoho delta is incomplete")
    make_relief()
    packed = {
        "bounds": [*points([(BOUNDS[0], BOUNDS[1])])[0], *points([(BOUNDS[2], BOUNDS[3])])[0]],
        "land": polygons(shore),
        "sharedCoast": lines(shared_coast),
        "formerCoast": lines(former_coast),
        "vent": vent,
        "fissures": lines(fissures),
        "snapshots": snapshots,
        "overflight": make_overflight(),
    }
    file = ROOT / "kilauea.json"
    file.write_text(json.dumps(packed, separators=(",", ":")) + "\n")
    print(f"Packed {len(snapshots)} USGS maps ({file.stat().st_size:,} bytes) and the 3DEP relief.")


if __name__ == "__main__":
    main()
