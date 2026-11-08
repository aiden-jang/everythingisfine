"""Build Moonfall's terrain and traverses from the USGS Apollo 17 survey.

Requires NumPy, Pillow, PyProj, PyShp, and Rasterio. Supply the original DEM, orthomosaic,
2K Moon JPEG, and the extracted GIS directory (containing the two shapefiles).
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from pyproj import CRS, Transformer
import rasterio
from rasterio.windows import from_bounds
import shapefile


SURVEY = 'https://asc-astropedia.s3.us-west-2.amazonaws.com/Moon/Apollo/Traverse/Apollo17/ancillary/'
MOON = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg'
BOUNDS = (-7500, 606000, 6000, 617300)
OUT = Path(__file__).resolve().parents[1] / 'src/sources/moonfall/recordings'


def save_webp(image, name, quality, source):
    xmp = (
        '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF '
        'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        f'<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:source="{source}"/>'
        '</rdf:RDF></x:xmpmeta>'
    )
    image.save(OUT / name, quality=quality, xmp=xmp.encode())


def to_km(easting, northing):
    return [round(easting / 1000, 4), round((612000 - northing) / 1000, 4)]


def read_shape(directory, name):
    base = directory / f'APOLLO17_{name}_2018'
    return shapefile.Reader(shp=str(base.with_suffix('.SHP')), dbf=str(base.with_suffix('.DBF')))


def write_traverses(directory, projection):
    with read_shape(directory, 'TRAVERSE') as reader:
        lines = [shape.points for shape in reader.shapes()]
    with read_shape(directory, 'CONTROLPOINTS') as reader:
        controls = {row.record[0]: row.shape.points[0] for row in reader.iterShapeRecords()}

    # The source stores multipart traverses as separate records with a shared zero ID.
    # Order them by the mission traverse map. EVA 2 retraces the first recorded segment in reverse.
    order = [[4, 5, 6], [3, 0, 1, 2], [7, 8]]
    lines[0].reverse()
    tracks = [[[to_km(e - 500000, n) for e, n in lines[i]] for i in day] for day in order]
    project = Transformer.from_crs(projection.geodetic_crs, projection, always_xy=True)

    def control(index):
        return to_km(*project.transform(*controls[index]))

    stops = [[3], [7, 9, 12, 15], [18, 21, 24, 28]]
    data = {'landing': control(30), 'stations': [[control(i) for i in day] for day in stops], 'tracks': tracks}
    (OUT / 'traverses.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('gis', type=Path, help=f'GIS directory extracted from {SURVEY}Apollo17_PDS_fullPackage_Haase.zip')
    parser.add_argument('--dem', default=f'{SURVEY}APOLLO17_DTM_150CM.TIFF')
    parser.add_argument('--ortho', default=f'{SURVEY}APOLLO17_ORTHOMOSAIC_50CM.TIFF')
    parser.add_argument('--moon', type=Path, required=True, help=f'Original Moon JPEG from {MOON}')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', VSI_CACHE='TRUE'):
        with rasterio.open(args.dem) as source:
            grid = source.read(1, window=from_bounds(*BOUNDS, source.transform), out_shape=(176, 210), masked=True)
            if np.ma.getmaskarray(grid).any():
                raise ValueError('Elevation grid contains missing samples')
            (OUT / 'taurus-littrow.bin').write_bytes(np.rint(grid).astype('<i2').tobytes())
            projection = CRS.from_wkt(source.crs.to_wkt())
        with rasterio.open(args.ortho) as source:
            photo = source.read(1, window=from_bounds(*BOUNDS, source.transform), out_shape=(1256, 1500))
            low, high = np.percentile(photo[photo > 0], [1, 99])
            contrast = np.clip((photo.astype(float) - low) * 172 / (high - low) + 45, 0, 255).astype(np.uint8)
            save_webp(Image.fromarray(contrast), 'taurus-littrow.webp', 87, f'{SURVEY}APOLLO17_ORTHOMOSAIC_50CM.TIFF')
    with Image.open(args.moon) as image:
        save_webp(image, 'moon.webp', 85, MOON)
    write_traverses(args.gis, projection)


if __name__ == '__main__':
    main()
