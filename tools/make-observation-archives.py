"""Extract dated satellite scans, gauge records, and drifter tracks for the observatory."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from heapq import heappop, heappush
from io import BytesIO
import json
from pathlib import Path
import re
from urllib.parse import quote
from urllib.request import urlopen

import h5py
import numpy as np
from PIL import Image
from pyproj import Proj
from scipy.io import netcdf_file
from scipy.ndimage import map_coordinates

ROOT = Path(__file__).resolve().parents[1] / "src/sources/observations"
ASSETS = ROOT / "archive-assets"
GOES = "https://noaa-goes16.s3.amazonaws.com"
GDP = "https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/"
ETOPO = "https://upwell.pfeg.noaa.gov/erddap/griddap/etopo180.nc?altitude%5B0:45:10800%5D%5B0:45:21600%5D"
DART = "https://www.ngdc.noaa.gov/hazard/data/DART/20100227_chile/"
EVENT = datetime(2010, 2, 27, 6, 34, 11, tzinfo=timezone.utc)
BASIS = [-91, 34, -60, 55]
DAYS = ["157/15", "158/12", "158/15", "158/18", "159/12"]
DRIFTERS = [145689, 300234064011410, 300234065713220]


def fetch(url):
    with urlopen(url, timeout=90) as response:
        return response.read()


def save(name, data):
    (ROOT / name).write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")


def smoke_frame(job):
    index, hour = job
    prefix = "ABI-L2-CMIPC/2023/" + hour + "/"
    listing = fetch(f"{GOES}/?list-type=2&max-keys=100&prefix={prefix}").decode()
    keys = re.findall(r"<Key>([^<]+)</Key>", listing)
    selected = [next(key for key in keys if f"C{band:02}_G16" in key) for band in [2, 3, 1]]
    channels = []
    coverage = []
    for key in selected:
        with h5py.File(BytesIO(fetch(f"{GOES}/{key}")), "r") as file:
            projection = file["goes_imager_projection"].attrs
            height = float(np.asarray(projection["perspective_point_height"]).item())
            project = Proj(
                proj="geos", h=height, lon_0=float(np.asarray(projection["longitude_of_projection_origin"]).item()),
                a=float(np.asarray(projection["semi_major_axis"]).item()),
                b=float(np.asarray(projection["semi_minor_axis"]).item()), sweep="x",
            )
            lons, lats = np.meshgrid(
                np.linspace(BASIS[0], BASIS[2], 720),
                np.linspace(BASIS[3], BASIS[1], 496),
            )
            xx, yy = project(lons, lats)
            axes = []
            for name in ["x", "y"]:
                var = file[name]
                axes.append(var[:] * var.attrs["scale_factor"] + var.attrs["add_offset"])
            x, y = axes
            cmi = file["CMI"]
            data = cmi[:].astype(float)
            valid = data != cmi.attrs["_FillValue"]
            data[~valid] = 0
            data = data * cmi.attrs["scale_factor"] + cmi.attrs["add_offset"]
            row = (yy / height - y[0]) / (y[1] - y[0])
            col = (xx / height - x[0]) / (x[1] - x[0])
            channels.append(map_coordinates(data, [row, col], order=1, mode="constant"))
            coverage.append(map_coordinates(valid.astype(float), [row, col], order=1, mode="constant"))
    red, green, blue = [np.clip(channel, 0, 1) ** 0.52 for channel in channels]
    rgb = np.stack([red, 0.45 * red + 0.10 * green + 0.45 * blue, blue], axis=2)
    rgba = np.concatenate([rgb, np.minimum.reduce(coverage)[..., None]], axis=2)
    Image.fromarray(np.uint8(np.clip(rgba, 0, 1) * 255)).save(ASSETS / f"smoke-{index}.webp", quality=86)
    match = re.search(r"_s(\d{13})\d_", selected[0])
    at = datetime.strptime(match[1], "%Y%j%H%M%S").replace(tzinfo=timezone.utc)
    return [int(at.timestamp() * 1000), selected]


def travel_times():
    with netcdf_file(BytesIO(fetch(ETOPO)), "r", mmap=False) as file:
        lats = file.variables["latitude"].data.copy()
        lons = file.variables["longitude"].data[:-1].copy()
        depth = -file.variables["altitude"].data[:, :-1].astype(float)
    height, width = depth.shape
    speed = np.sqrt(9.80665 * np.maximum(depth, 0))
    valid = (depth > 10) & (np.abs(lats[:, None]) < 78)
    times = np.full(depth.shape, np.inf)
    # Find the nearest wet ETOPO cell to NOAA's published epicentre.
    distance = (lats[:, None] + 36.122) ** 2 + (lons[None, :] + 72.898) ** 2
    row, col = np.unravel_index(np.argmin(np.where(valid, distance, np.inf)), depth.shape)
    times[row, col] = 0
    queue = [(0, row, col)]
    steps = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    while queue:
        hours, row, col = heappop(queue)
        if hours > times[row, col] or hours > 27:
            continue
        for dr, dc in steps:
            r, c = row + dr, (col + dc) % width
            if not 0 <= r < height or not valid[r, c]:
                continue
            if dr and dc and not (valid[r, col] or valid[row, c]):
                continue
            dx = dc * np.cos(np.radians((lats[row] + lats[r]) / 2))
            metres = 6371000 * np.radians(0.75) * np.hypot(dr, dx)
            next_hours = hours + metres / (0.5 * (speed[row, col] + speed[r, c])) / 3600
            if next_hours < times[r, c]:
                times[r, c] = next_hours
                heappush(queue, (next_hours, r, c))
    for hour in range(25):
        age = hour - times
        head = np.where(age >= 0, np.exp(-np.maximum(age, 0) * 1.7), 0)
        wake = np.where(age >= 0, 0.24 * np.exp(-np.maximum(age, 0) * 0.07), 0)
        alpha = np.clip(head + wake, 0, 1)
        rgba = np.stack([33 + head * 75, 128 + head * 105, 166 + head * 86, alpha * 210], axis=2)
        frame = Image.fromarray(np.flipud(np.uint8(rgba))).resize((720, 360), Image.Resampling.BILINEAR)
        frame.save(ASSETS / f"tsunami-{hour}.webp", quality=80)


def buoy(id, name, lat, lon, suffix):
    raw = fetch(f"{DART}DART{id}_{suffix}.web").decode().splitlines()[2:]
    values = []
    for line in raw:
        row = line.split()
        if len(row) < 10:
            continue
        at = datetime(*map(int, row[1:7]), tzinfo=timezone.utc)
        seconds = int((at - EVENT).total_seconds())
        if not 0 <= seconds <= 24 * 3600 or at.minute % 5 or at.second != 0:
            continue
        value = float(row[9])
        if abs(value) < 5:
            values.append([seconds, value])
    return dict(id=id, name=name, lat=lat, lon=lon, values=values)


def drifter(id):
    query = quote(f"id,t,latitude,longitude,u,v&id={id}", safe=",&=")
    values = json.loads(fetch(GDP + "drifter_loopers.json?" + query))["table"]["rows"]
    if len(values) > 200:
        values = values[:200]
    return dict(id=str(id), values=[row[1:] for row in values if all(value is not None for value in row)])


def recent_drifter():
    query = quote(
        'platform_code,time,latitude,longitude,sst&platform_type="DRIFTING BUOYS"&platform_code="4401657"'
        '&time>=2026-10-31T00:00:00Z&time<=2026-11-06T16:00:00Z',
        safe=",&=",
    )
    rows = json.loads(fetch(GDP + "OSMC_RealTime.json?" + query))["table"]["rows"]
    fixes = {}
    for _, stamp, lat, lon, sst in rows:
        if lat is not None and lon is not None and sst is not None:
            fixes[stamp] = [stamp, lat, lon, sst]
    save("drifter-surface.json", sorted(fixes.values()))


def jet_stream():
    endpoint = "https://thredds.ucar.edu/thredds/ncss/grid/grib/NCEP/GFS/Global_0p5deg/Best"
    query = (
        "var=u-component_of_wind_isobaric&var=v-component_of_wind_isobaric&north=85&south=-85"
        "&west=0&east=359.5&horizStride=12&vertCoord=25000&time_start=2026-11-06T12:00:00Z"
        "&time_end=2026-11-07T12:00:00Z&timeStride=2&accept=netcdf3"
    )
    (ROOT / "jet-stream.nc").write_bytes(fetch(endpoint + "?" + query))


def air_sites():
    regions = {
        "New York": (40.7128, -74.006), "Boston": (42.3601, -71.0589), "Chicago": (41.8781, -87.6298),
        "Los Angeles": (34.0522, -118.2437), "San Francisco": (37.7749, -122.4194), "Seattle": (47.6062, -122.3321),
    }
    sites = {key: {} for key in regions}
    raw = fetch("https://files.airnowtech.org/airnow/today/monitoring_site_locations.dat").decode("latin-1")
    for line in raw.splitlines():
        fields = line.split("|")
        if len(fields) < 10 or fields[1] != "PM2.5" or fields[4] != "Active":
            continue
        try:
            lat, lon = map(float, fields[8:10])
        except ValueError:
            continue
        for city, (origin_lat, origin_lon) in regions.items():
            if abs(lat - origin_lat) < 1.2 and abs(lon - origin_lon) < 1.7:
                sites[city][fields[0][-9:]] = [round(lat, 4), round(lon, 4), fields[3].strip()]
    save("air-sites.json", {key: dict(lat=lat, lon=lon, sites=sites[key]) for key, (lat, lon) in regions.items()})


def main():
    ASSETS.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        smoke_jobs = [pool.submit(smoke_frame, job) for job in enumerate(DAYS)]
        drifter_jobs = [pool.submit(drifter, id) for id in DRIFTERS]
        model = pool.submit(travel_times)
        sites = pool.submit(air_sites)
        recent = pool.submit(recent_drifter)
        jet = pool.submit(jet_stream)
        buoys = [pool.submit(buoy, *args) for args in [
            ("32412", "Southwest of Peru", -17.975, -86.392, "realT"),
            ("32411", "Off Panama", 4.9242, -90.6858, "meter"),
            ("46407", "Off Oregon", 42.605, -128.897, "realT"),
        ]]
        save("smoke-scans.json", [job.result() for job in smoke_jobs])
        save("drifter-tracks.json", [job.result() for job in drifter_jobs])
        save("tsunami-readings.json", [job.result() for job in buoys])
        model.result()
        sites.result()
        recent.result()
        jet.result()


if __name__ == "__main__":
    main()
