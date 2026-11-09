"""Reproducible, bounded scientific archives for the shared observation surface."""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlencode

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/sources/earth-atlas'
ASSETS = OUT / 'assets'
CACHE = Path(os.environ.get('EIF_ATLAS_CACHE', str(Path(tempfile.gettempdir()) / 'eif-atlas-inputs')))
for folder in [OUT, ASSETS, CACHE]:
    folder.mkdir(parents=True, exist_ok=True)
INPUTS = {}


def fetch(url):
    path = CACHE / sha256(url.encode()).hexdigest()
    if not path.exists():
        subprocess.run(['node', str(ROOT / 'tools/archive-fetch.mjs'), url, str(path)], check=True)
    raw = path.read_bytes()
    INPUTS[url] = sha256(raw).hexdigest()
    return raw


def save(name, data):
    (OUT / (name + '.json')).write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + '\n')


def provenance(name):
    save(name + '-sources', dict(retrieved=datetime.now(timezone.utc).isoformat(), sha256=INPUTS))


def raster(image, name, source, lossless=True):
    filename = name + '.webp'
    image.save(ASSETS / filename, lossless=lossless, quality=90, method=6)
    (ASSETS / (filename + '.json')).write_text(json.dumps({'prompt': 'Sourced scientific raster: ' + source}) + '\n')
    return filename


def stamp(day):
    return int(datetime.fromisoformat(day.replace('Z', '+00:00')).replace(tzinfo=timezone.utc).timestamp() * 1000)


def days(start, end, step=1):
    day = datetime.fromisoformat(start)
    while day <= datetime.fromisoformat(end):
        yield day.strftime('%Y-%m-%d')
        day += timedelta(days=step)


def gibs(layer, day, bounds, name, size=(768, 384)):
    query = dict(SERVICE='WMS', REQUEST='GetMap', VERSION='1.1.1', LAYERS=layer, STYLES='',
                 SRS='EPSG:4326', BBOX=','.join(map(str, bounds)), WIDTH=size[0], HEIGHT=size[1],
                 FORMAT='image/png', TRANSPARENT='TRUE', TIME=day)
    url = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?' + urlencode(query)
    image = Image.open(BytesIO(fetch(url))).convert('RGBA')
    if not image.getbbox():
        return None
    return raster(image, name, url)


def colorize(values, stops, colors, mask=None):
    valid = np.isfinite(values) if mask is None else (np.isfinite(values) & mask)
    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    for channel in range(3):
        rgba[..., channel] = np.nan_to_num(np.interp(values, stops, [c[channel] for c in colors])).astype(np.uint8)
    rgba[..., 3] = np.where(valid, 230, 0)
    return Image.fromarray(rgba)
