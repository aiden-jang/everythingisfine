"""Regional GEBCO terrain and annual NASA ITS_LIVE glacier velocity windows."""
from hashlib import sha256
import re
import sys
from urllib.parse import quote

import numpy as np
from pyproj import Transformer
import rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from scipy.interpolate import RegularGridInterpolator, griddata

from atlas_archive import INPUTS, colorize, fetch, provenance, raster, save


def seafloor():
    query = quote('elevation[23760:10:25920][76800:10:78960]', safe='')
    url = 'https://dap.ceda.ac.uk/thredds/dodsC/bodc/gebco/global/gebco_2026/ice_surface_elevation/netcdf/GEBCO_2026.nc.ascii?' + query
    raw = fetch(url).decode()
    grid = np.array([[int(x) for x in line.split(',')[1:]] for line in raw.splitlines() if re.match(r'^\[\d+\],', line)])
    lat = np.fromstring(raw.split('elevation.lat[217]\n')[1].split('\n')[0], sep=',')
    lon = np.fromstring(raw.split('elevation.lon[217]\n')[1].split('\n')[0], sep=',')
    assert grid.shape == (217, 217) and grid.min() < -10000
    tid_url = 'https://dap.ceda.ac.uk/thredds/dodsC/bodc/gebco/global/gebco_2026/type_identifier_grid/netcdf/gebco_2026_tid.nc.ascii?' + quote('tid[23760:10:25920][76800:10:78960]', safe='')
    raw_tid = fetch(tid_url).decode()
    tid = np.array([[int(x) for x in line.split(',')[1:]] for line in raw_tid.splitlines() if re.match(r'^\[\d+\],', line)])
    assert tid.shape == grid.shape
    image = colorize(grid[::-1], [-11000, -8000, -5000, -2000, 0, 1000],
                     [(7, 16, 36), (20, 51, 88), (36, 94, 116), (79, 153, 153), (181, 197, 164), (229, 213, 176)])
    raster(image, 'seafloor', url + '; nearest 10th grid cell, north-up; depth palette')
    save('seafloor', dict(bounds=[lon[0], lat[0], lon[-1], lat[-1]], columns=217, rows=217,
                         elevation=grid.flatten().tolist(), tid=tid.flatten().tolist(), image='seafloor.webp'))


def glacier():
    bounds = [-50.4, 68.8, -48.7, 69.5]
    frames = []
    for year in [2013, 2024]:
        arrays = {}
        for field in ['vx', 'vy', 'v', 'v_error', 'count']:
            url = f'https://its-live-data.s3.amazonaws.com/velocity_mosaic/v2.1/annual/cog/ITS_LIVE_velocity_120m_RGI05A_{year}_V02.1_{field}.tif'
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_TIMEOUT='60'):
                with rasterio.open(url) as source:
                    box = transform_bounds('EPSG:4326', source.crs, *bounds)
                    window = from_bounds(*box, source.transform)
                    data = source.read(1, window=window, out_shape=(96, 96), masked=True).astype(float).filled(np.nan)
                    arrays[field] = data
                    INPUTS[url + '#window=' + ','.join(map(str, bounds))] = sha256(data.tobytes()).hexdigest()
        x = np.linspace(box[0], box[2], 96, endpoint=False) + (box[2] - box[0]) / 192
        y = np.linspace(box[3], box[1], 96, endpoint=False) - (box[3] - box[1]) / 192
        inverse = Transformer.from_crs('EPSG:3413', 'EPSG:4326', always_xy=True)
        xx, yy = np.meshgrid(x, y)
        lon, lat = inverse.transform(xx, yy)
        valid = np.isfinite(arrays['v']) & (arrays['v'] >= 0) & (arrays['count'] >= 5)
        gx, gy = np.meshgrid(np.linspace(bounds[0], bounds[2], 384), np.linspace(bounds[3], bounds[1], 384))
        v = griddata(np.column_stack((lon[valid], lat[valid])), arrays['v'][valid], (gx, gy), method='nearest')
        footprint = griddata(np.column_stack((lon.flatten(), lat.flatten())), valid.astype(float).flatten(), (gx, gy), method='nearest')
        name = raster(colorize(v, [0, 500, 2000, 6000, 12000], [(14, 33, 57), (41, 93, 124), (72, 161, 171), (183, 209, 147), (246, 203, 124)], footprint > .5),
                      f'glacier-{year}', f'NASA ITS_LIVE annual Greenland velocity mosaic v2.1, {year}; EPSG:3413 to geographic; 5+ contributing pairs')
        velocities = [RegularGridInterpolator((y[::-1], x), arrays[k][::-1], bounds_error=False, fill_value=np.nan) for k in ['vx', 'vy']]
        paths = []
        for row in range(3, 94, 5):
            for col in range(3, 94, 5):
                if not valid[row, col] or arrays['v'][row, col] < 150:
                    continue
                px, py = x[col], y[row]
                points = []
                for step in range(25):
                    lng, lt = inverse.transform(px, py)
                    if not (bounds[0] <= lng <= bounds[2] and bounds[1] <= lt <= bounds[3]):
                        break
                    points.append([round(lng, 5), round(lt, 5)])
                    vx, vy = [float(f((py, px))) for f in velocities]
                    if not np.isfinite(vx + vy):
                        break
                    px += vx / 24
                    py += vy / 24
                if len(points) > 1:
                    paths.append(points)
        frames.append(dict(year=year, image=name, paths=paths,
                           maxVelocity=round(float(arrays['v'][valid].max())),
                           medianError=round(float(np.nanmedian(arrays['v_error'][valid & (arrays['v'] >= 150)])), 1)))
    save('glacier', dict(bounds=bounds, frames=frames))


if __name__ == '__main__':
    for name in sys.argv[1:]:
        globals()[name]()
        provenance(name)
        print(name, 'ready', flush=True)
