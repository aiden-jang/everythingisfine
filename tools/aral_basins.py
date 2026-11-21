"""Summarize observed water within fixed windows of the early Aral footprint."""
import numpy as np

BASINS = [
    dict(id="north", label="North Aral", lon=61.02, lat=46.46, bounds=[59.55, 46.02, 62, 47]),
    dict(id="west", label="West basin", lon=58.57, lat=44.93, bounds=[57, 43, 59.6, 46.02]),
    dict(id="east", label="East basin", lon=60.23, lat=44.96, bounds=[59.6, 43, 62, 46.02]),
]


def basin_readings(data, baseline, bounds):
    west, south, east, north = bounds
    height, width = data.shape
    longitude = west + (np.arange(width) + .5) * (east - west) / width
    latitude = north - (np.arange(height) + .5) * (north - south) / height
    lon, lat = np.meshgrid(longitude, latitude)
    area = np.cos(np.deg2rad(lat))
    readings = {}
    for basin in BASINS:
        w, s, e, n = basin["bounds"]
        window = baseline & (lon >= w) & (lon < e) & (lat >= s) & (lat < n)
        surveyed = window & (data != 0)
        covered = area[surveyed].sum()
        wet = area[window & (data >= 2)].sum()
        readings[basin["id"]] = dict(
            missing=round(float((1 - covered / area[window].sum()) * 100), 1),
            water=round(float(wet / covered * 100), 1) if covered else None,
        )
    return readings
