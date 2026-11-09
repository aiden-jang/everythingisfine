"""Preserve observations, quality screening and gaps in bounded ocean archives."""
import csv
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO, StringIO
import re
import sys
from urllib.parse import quote

import numpy as np
from netCDF4 import Dataset, num2date
from PIL import Image
import rasterio
from rasterio.windows import from_bounds
from hashlib import sha256
from scipy.ndimage import binary_erosion

from atlas_archive import CACHE, INPUTS, colorize, fetch, provenance, raster, save


def nino():
    query = 'time,longitude,depth,T_20,QT_5020&latitude=0&longitude>=130&longitude<=270&depth<=500&time>=1997-01-01T00:00:00Z&time<1999-01-01T00:00:00Z&QT_5020>=1&QT_5020<=2'
    url = 'https://data.pmel.noaa.gov/pmel/erddap/tabledap/pmelTaoDyT.csv?' + quote(query, safe=',&=<>:')
    lines = fetch(url).decode().splitlines()
    groups = {}
    for row in csv.DictReader([lines[0]] + lines[2:]):
        key = (row['time'][:7], float(row['longitude']), float(row['depth']))
        value = float(row['T_20'])
        if np.isfinite(value):
            groups.setdefault(key, []).append(value)
    frames = []
    depths = np.arange(1, 502, 5)
    longitudes = np.arange(130, 271)
    for month in sorted({key[0] for key in groups}):
        observations = [[lon, depth, round(float(np.mean(values)), 2), len(values)]
                        for (m, lon, depth), values in groups.items() if m == month and len(values) >= 10]
        sites = sorted(set(p[0] for p in observations))
        columns = []
        for lon in sites:
            records = sorted([p for p in observations if p[0] == lon], key=lambda p: p[1])
            columns.append(np.interp(depths, [p[1] for p in records], [p[2] for p in records], left=np.nan, right=np.nan))
        field = np.full((len(depths), len(longitudes)), np.nan)
        for left in range(len(sites) - 1):
            a, b = sites[left:left+2]
            if b - a > 20:
                continue
            for col, lon in enumerate(longitudes):
                if a <= lon <= b:
                    t = (lon - a) / (b - a)
                    field[:, col] = columns[left] * (1 - t) + columns[left + 1] * t
        image = raster(colorize(field, [8, 14, 20, 26, 31], [(30, 57, 113), (51, 125, 168), (103, 188, 183), (238, 205, 114), (192, 73, 47)]),
                       'nino-' + month, url + '; monthly means with >=10 daily readings; vertical interpolation within observed depth; no horizontal interpolation across gaps >20 degrees')
        frames.append(dict(day=month + '-15', image=image, observations=observations))
    save('nino', dict(frames=frames, depth=[1, 501], longitudes=[130, 270]))


def reef():
    query = 'degree_heating_week[(2023-06-01T12:00:00Z):7:(2023-10-15T12:00:00Z)][(30):2:(18)][(-90):2:(-60)]'
    url = 'https://polarwatch.noaa.gov/erddap/griddap/noaacrwdhwDaily.nc?' + quote(query, safe='')
    with Dataset('reef', memory=fetch(url)) as source:
        times = num2date(source['time'][:], source['time'].units)
        latitude, longitude = source['latitude'][:], source['longitude'][:]
        data = source['degree_heating_week'][:].filled(np.nan)
    frames = []
    row, col = np.argmin(abs(latitude - 24.4)), np.argmin(abs(longitude + 81.4))
    sst_query = 'analysed_sst[(2023-06-01T12:00:00Z):7:(2023-10-15T12:00:00Z)][(24.4)][(-81.4)]'
    sst_url = 'https://polarwatch.noaa.gov/erddap/griddap/noaacrwsstDaily.nc?' + quote(sst_query, safe='')
    sst_csv = fetch(sst_url.replace('.nc?', '.csv?')).decode().splitlines()
    sst = {row['time'][:10]: float(row['analysed_sst']) for row in csv.DictReader([sst_csv[0]] + sst_csv[2:])}
    for at, values in zip(times, data):
        day = at.strftime('%Y-%m-%d')
        image = raster(colorize(values, [0, 4, 8, 12, 20], [(30, 67, 93), (244, 211, 126), (223, 122, 77), (173, 61, 86), (111, 62, 119)]),
                       'reef-' + day, url + '; 0.1-degree regional subset, degree-heating-week palette')
        value = float(values[row, col])
        frames.append(dict(day=day, image=image, keys=round(value, 2) if np.isfinite(value) else None, sst=round(float(sst[day]), 2) if np.isfinite(sst.get(day, np.nan)) else None))
    dy, dx = abs(latitude[1] - latitude[0]) / 2, abs(longitude[1] - longitude[0]) / 2
    save('reef', dict(bounds=[float(longitude[0]-dx), float(latitude[-1]-dy), float(longitude[-1]+dx), float(latitude[0]+dy)], frames=frames))


def aral():
    bounds = [57, 43, 62, 47]
    base = 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GSWE/YearlyClassification/LATEST/tiles/'
    def one(year):
        directory = base + f'yearlyClassification{year}/'
        files = re.findall('href="([^"]+tif)"', fetch(directory).decode())
        parts = []
        urls = []
        for column, west, east, width in [(920000, 57, 60, 300), (960000, 60, 62, 200)]:
            filename = next(name for name in files if name.endswith(f'0000120000-{column:010d}.tif'))
            url = directory + filename
            cache = CACHE / f'aral-{year}-{column}.npy'
            if cache.exists():
                part = np.load(cache)
            else:
                with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_TIMEOUT='90'):
                    with rasterio.open(url) as source:
                        window = from_bounds(west, 43, east, 47, source.transform)
                        part = source.read(1, window=window, out_shape=(400, width), masked=True).filled(0)
                np.save(cache, part)
            parts.append(part)
            urls.append(url)
            INPUTS[url + '#window=' + ','.join(map(str, [west, 43, east, 47]))] = sha256(part.tobytes()).hexdigest()
        data = np.concatenate(parts, axis=1)
        assert data.shape == (400, 500) and set(np.unique(data)).issubset({0, 1, 2, 3}), (year, data.shape, np.unique(data))
        return year, data, ' and '.join(urls)
    years = sorted(set([1984, 1985, 1986] + list(range(1987, 2022, 2))))
    with ThreadPoolExecutor(max_workers=3) as pool:
        observations = list(pool.map(one, years))
    baseline = np.logical_or.reduce([a >= 2 for year, a, url in observations if year <= 1986])
    edge = baseline & ~binary_erosion(baseline)
    frames = []
    for year, data, url in observations:
        rgba = np.zeros((*data.shape, 4), dtype=np.uint8)
        rgba[data == 2] = [112, 192, 203, 175]
        rgba[data == 3] = [57, 135, 178, 245]
        rgba[edge] = [230, 225, 197, 235]
        image = raster(Image.fromarray(rgba), 'aral-' + str(year), url + '; seasonal and permanent water; 1984–1986 observed-water boundary retained; nearest-neighbor geographic subset')
        frames.append(dict(year=year, image=image, missing=round(float(np.mean(data[baseline] == 0) * 100), 1)))
    save('aral', dict(bounds=bounds, frames=frames))


if __name__ == '__main__':
    for name in sys.argv[1:]:
        globals()[name]()
        provenance(name)
        print(name, 'ready', flush=True)
