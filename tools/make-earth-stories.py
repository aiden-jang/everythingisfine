"""Build bounded observation archives; raw inputs stay in a temporary cache."""
import csv
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from io import BytesIO, StringIO
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlencode
import xml.etree.ElementTree as ET
import zipfile

import shapefile
import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy.ndimage import map_coordinates

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/sources/earth-stories'
CACHE = Path(os.environ.get('EIF_ARCHIVE_CACHE', str(Path(tempfile.gettempdir()) / 'eif-earth-archives')))
CACHE.mkdir(parents=True, exist_ok=True)
ASSETS = OUT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?'
NSIDC = 'https://noaadata.apps.nsidc.org/NOAA/G02135/north/'
MANIFEST = {}


def fetch(url):
    key = sha256(url.encode()).hexdigest()
    path = CACHE / key
    if not path.exists():
        subprocess.run(['node', str(ROOT / 'tools/archive-fetch.mjs'), url, str(path)], check=True)
    raw = path.read_bytes()
    MANIFEST[url] = sha256(raw).hexdigest()
    return raw


def save(name, data):
    (OUT / (name + '.json')).write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False) + '\n')


def raster(image, name, source, **options):
    image.save(ASSETS / name, **options)
    (ASSETS / (name + '.json')).write_text(json.dumps({'prompt': 'Sourced scientific raster: ' + source}, ensure_ascii=False) + '\n')


def stamp(day):
    return int(datetime.fromisoformat(day.replace('Z', '+00:00')).replace(tzinfo=timezone.utc).timestamp() * 1000)


def days(start, end, step=1):
    day = datetime.fromisoformat(start)
    while day <= datetime.fromisoformat(end):
        yield day.strftime('%Y-%m-%d')
        day += timedelta(days=step)


def map_image(layer, day, bounds, name, width=768, height=384):
    west, south, east, north = bounds
    query = dict(SERVICE='WMS', REQUEST='GetMap', VERSION='1.1.1', LAYERS=layer, STYLES='',
                 SRS='EPSG:4326', BBOX=','.join(map(str, bounds)), WIDTH=width, HEIGHT=height,
                 FORMAT='image/png', TRANSPARENT='TRUE', TIME=day)
    url = WMS + urlencode(query)
    raw = fetch(url)
    im = Image.open(BytesIO(raw)).convert('RGBA')
    if not im.getbbox():
        return None
    raster(im, name + '.webp', url, lossless=True)
    return name + '.webp'


def relief(bounds,name):
    query=dict(bbox=','.join(map(str,bounds)),bboxSR=4326,imageSR=4326,f='image',size='1100,1000',format='png32',adjustAspectRatio='false',renderingRule=json.dumps({'rasterFunction':'Hillshade Gray'}))
    url='https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?'+urlencode(query)
    raw=fetch(url)
    im=Image.open(BytesIO(raw)).convert('L')
    shade=np.asarray(im)
    palette=[(12,22,25),(27,45,46),(51,68,66),(107,112,100)]
    tinted=[np.interp(shade,(20,110,185,255),channel) for channel in zip(*palette)]
    raster(Image.fromarray(np.uint8(np.stack(tinted,axis=-1))),name+'.webp',url+'; tinted shaded relief',quality=88,method=6)


def fault():
    base = 'https://www.sciencebase.gov/catalog/item/'
    def member(id, prefix, suffix):
        meta = json.loads(fetch(base + id + '?format=json'))
        url = next(f['url'] for f in meta['files'] if f['name'].startswith(prefix))
        z = zipfile.ZipFile(BytesIO(fetch(url)))
        return z.read(next(n for n in z.namelist() if n.endswith(suffix) and not n.startswith('__')))
    kmz = zipfile.ZipFile(BytesIO(member('5ef132f282ced62aaae18faa', 'KMZ', '.kmz')))
    root = ET.fromstring(kmz.read(next(n for n in kmz.namelist() if n.endswith('.kml'))))
    ns = {'k': 'http://www.opengis.net/kml/2.2'}
    lines = []
    for mark in root.findall('.//k:Placemark', ns):
        attrs = {x.attrib['name']: x.text for x in mark.findall('.//k:SimpleData', ns)}
        source = attrs.get('Source', '')
        if source not in ['Mw 6.4', 'Mw 7.1'] or attrs.get('Origin') != 'Tectonic':
            continue
        for coord in mark.findall('.//k:LineString/k:coordinates', ns):
            pts = [[round(float(v), 5) for v in p.split(',')[:2]] for p in coord.text.split()]
            if len(pts) >= 2:
                lines.append([0 if source == 'Mw 6.4' else 1, pts])
    raw = member('5ef18f7f82ced62aaae19257', 'CSV', '.csv').decode('utf-8-sig')
    points = []
    for row in csv.DictReader(StringIO(raw)):
        if row['horiz_offset_pref'] and row['source'] in ['6.4', '7.1']:
            points.append(dict(id=row['intid'], lon=float(row['longitude']), lat=float(row['latitude']),
                               cm=float(row['horiz_offset_pref']), event=row['source'], sense=row['sense'],
                               feature=row['observed_feature'], note=row['description'] or row['note'],
                               observed=row['obs_date'][:10]))
    radar = zipfile.ZipFile(BytesIO(fetch('https://d1z62tir4fw0q0.cloudfront.net/20190704-California_EQ/ARIA_coseismic_InSAR_ALOS-2.kmz')))
    kml = ET.fromstring(radar.read('doc.kml'))
    box = kml.find('.//k:LatLonBox', ns)
    bounds = [float(box.find('k:'+side,ns).text) for side in ['west','south','east','north']]
    image = Image.open(BytesIO(radar.read(kml.find('.//k:GroundOverlay/k:Icon/k:href',ns).text))).convert('RGBA')
    image.thumbnail((1300,1800))
    raster(image,'fault-insar.webp','NASA ARIA / JAXA ALOS-2: https://d1z62tir4fw0q0.cloudfront.net/20190704-California_EQ/ARIA_coseismic_InSAR_ALOS-2.kmz ; KML GroundOverlay, resized to fit 1300×1800',lossless=True)
    save('fault-radar',dict(bounds=bounds,image='fault-insar.webp'))
    relief([-118.12,35.2,-117.0,36.2],'fault-relief')
    save('fault', dict(lines=lines, points=points))


def fire():
    url = 'https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/2021/viirs-snpp_2021_United_States.csv'
    rows = []
    for r in csv.DictReader(StringIO(fetch(url).decode())):
        lat, lon = float(r['latitude']), float(r['longitude'])
        if 39.7 <= lat <= 40.9 and -121.7 <= lon <= -120.2 and '2021-07-14' <= r['acq_date'] <= '2021-10-22' and r['type'] == '0' and r['confidence'] != 'l':
            clock = r['acq_time'].zfill(4)
            rows.append([stamp(r['acq_date'] + 'T' + clock[:2] + ':' + clock[2:] + ':00Z'),lon,lat,float(r['frp'])])
    rows.sort()
    relief([-121.7,39.7,-120.2,40.9],'fire-relief')
    save('fire', dict(detections=rows, bounds=[-121.7,39.7,-120.2,40.9]))


def comet():
    query = dict(format='json', COMMAND="'C/2020 F3'", CENTER="'500@399'", MAKE_EPHEM="'YES'",
                 EPHEM_TYPE="'OBSERVER'", START_TIME="'2020-07-01'", STOP_TIME="'2020-08-01'",
                 STEP_SIZE="'1 h'", QUANTITIES="'1,20,23'", CSV_FORMAT="'YES'", ANG_FORMAT="'DEG'")
    source = json.loads(fetch('https://ssd.jpl.nasa.gov/api/horizons.api?' + urlencode(query)))['result']
    rows = []
    for r in csv.reader(source.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()):
        at = datetime.strptime(r[0].strip(), '%Y-%b-%d %H:%M').replace(tzinfo=timezone.utc)
        rows.append([int(at.timestamp()*1000),float(r[3]),float(r[4]),float(r[5]),float(r[7])])
    save('comet', dict(samples=rows))


def north():
    import ppigrf
    rows = []
    for line in fetch('https://www.ngdc.noaa.gov/geomag/data/poles/NP.xy').decode().splitlines():
        if not line.strip():
            continue
        lon, lat, year = map(float, line.split())
        if 1900 <= year <= 2025:
            rows.append([int(year),round((lon+180)%360-180,4),lat])
    from importlib.metadata import version
    coefficients = Path(ppigrf.__file__).parent / 'IGRF14.shc'
    fetch('https://www.ngdc.noaa.gov/IAGA/vmod/coeffs/igrf14coeffs.txt')
    save('north-model',dict(package='ppigrf',version=version('ppigrf'),coefficient_sha256=sha256(coefficients.read_bytes()).hexdigest()))
    # ppigrf ships the IAGA IGRF-14 coefficients and Schmidt-normalized synthesis.
    text = (ROOT / 'src/app/tonight/cities.ts').read_text()
    cities = re.findall(r'name: "([^"]+)", lat: ([\d.-]+), lon: ([\d.-]+)',text)
    dates = [datetime(r[0],1,1) for r in rows]
    declination = {}
    for name, lat, lon in cities:
        east, north, up = ppigrf.igrf(float(lon),float(lat),0,dates)
        declination[name] = np.round(np.degrees(np.arctan2(east,north)).flatten(),2).tolist()
    save('north',dict(poles=rows,declination=declination))


def ice():
    extent_rows = list(csv.reader(StringIO(fetch(NSIDC+'daily/data/N_seaice_extent_daily_v4.0.csv').decode())))[2:]
    extents = {f'{int(r[0]):04}-{int(r[1]):02}-{int(r[2]):02}':float(r[3]) for r in extent_rows if len(r)>3 and int(r[0])==2012}
    climatology = list(csv.reader(StringIO(fetch(NSIDC+'daily/data/N_seaice_extent_climatology_1981-2010_v4.0.csv').decode())))
    save('ice-climatology',climatology)
    bounds = [-180,45,180,90]
    lon,lat = np.meshgrid(np.linspace(-180,180,1024),np.linspace(90,45,256))
    project = Transformer.from_crs('EPSG:4326','EPSG:3411',always_xy=True)
    xx,yy = project.transform(lon,lat)
    def one(day):
        date=datetime.fromisoformat(day)
        url=NSIDC+'daily/geotiff/'+date.strftime('%Y/%m_%b/N_%Y%m%d_extent_v4.0.tif')
        im=Image.open(BytesIO(fetch(url)))
        scale=im.tag_v2[33550]; tie=im.tag_v2[33922]
        grid=np.asarray(im)
        sample=map_coordinates(grid.astype(float),[(tie[4]-yy)/scale[1]-.5,(xx-tie[3])/scale[0]-.5],order=0,mode='constant',cval=255)
        valid=(sample==100) | (sample==1)
        rgba=np.zeros((*sample.shape,4),dtype=np.uint8);rgba[valid]=[180,221,242,225]
        name='ice-'+day+'.webp';raster(Image.fromarray(rgba),name,url+'; extent mask reprojected EPSG:3411 to geographic coordinates',lossless=True)
        doy=date.timetuple().tm_yday
        archive=zipfile.ZipFile(BytesIO(fetch(NSIDC+f'daily/shapefiles/dayofyear_median/median_extent_N_{doy:03}_1981-2010_polyline_v4.0.zip')))
        def part(ext):return BytesIO(archive.read(next(n for n in archive.namelist() if n.endswith(ext))))
        shapes=shapefile.Reader(shp=part('.shp'),dbf=part('.dbf'))
        prj=archive.read(next(n for n in archive.namelist() if n.endswith('.prj'))).decode()
        inverse=Transformer.from_crs(prj,'EPSG:4326',always_xy=True)
        paths=[]
        for shape in shapes.iterShapes():
            for first,last in zip(list(shape.parts),list(shape.parts)[1:]+[len(shape.points)]):
                xy=shape.points[first:last]
                lng,lat=inverse.transform(*zip(*xy))
                paths.append([[round(a,3),round(b,3)] for a,b in zip(lng,lat)])
        return dict(day=day,image=name,extent=extents.get(day),median=paths)
    with ThreadPoolExecutor(max_workers=5) as p:
        frames=list(p.map(one,days('2012-03-20','2012-09-16')))
    save('ice',dict(bounds=bounds,frames=frames))


def dust():
    bounds=[-100,0,0,42]
    def one(day):
        name=map_image('AIRS_L2_Dust_Score_Day',day,bounds,'dust-'+day)
        return dict(day=day,image=name)
    with ThreadPoolExecutor(max_workers=4) as p: frames=list(p.map(one,days('2020-06-17','2020-06-27')))
    profile=Image.open(BytesIO(fetch('https://asdc.larc.nasa.gov/calipso-imagery/data/BROWSE/production/V5-00/2020-06-23/2020-06-23_06-39-03_V5.00_1_1.png')))
    if profile.size != (1300,667):raise ValueError('CALIPSO browse axes changed; inspect before cropping')
    raster(profile.crop((625,298,1034,548)),'dust-curtain.webp','NASA / CNES CALIPSO: https://asdc.larc.nasa.gov/calipso-imagery/data/BROWSE/production/V5-00/2020-06-23/2020-06-23_06-39-03_V5.00_1_1.png ; crop (625,298,1034,548), 0–15 km',lossless=True)
    save('dust-transect',dict(points=[[-66.32,29.73],[-67.85,23.61],[-69.28,17.49],[-70.64,11.36]],height=15,exaggeration=80,image='dust-curtain.webp',at='2020-06-23T06:49:06Z',note='Ground track interpolated between published browse-axis coordinates; 0–15 km altitude, 80× vertical exaggeration. The browse strip spans approximately 06:45:44–06:50:47 UTC.'))
    save('dust',dict(bounds=bounds,frames=frames))


def ozone():
    bounds=[-180,-90,180,-40]
    def season(year):
        text=fetch(f'https://ozonewatch.gsfc.nasa.gov/meteorology/figures/ozone/to3areas_{year}_toms+omi+omps.txt').decode()
        areas={l.split()[0]:float(l.split()[1]) for l in text.splitlines() if re.match(r'\d{4}-',l)}
        def one(day):
            name=map_image('OMI_Ozone_TOMS_Total_Column',day,bounds,'ozone-'+day,768,192)
            return dict(day=day,image=name,area=areas.get(day))
        with ThreadPoolExecutor(max_workers=5) as p:return list(p.map(one,days(f'{year}-08-01',f'{year}-11-30',2)))
    save('ozone',dict(bounds=bounds,seasons={'2006':season(2006),'2019':season(2019)}))


def water():
    bounds=[-126,30,-110,44]
    base='https://grace-onearth.jpl.nasa.gov/nexus/timeSeriesSpark?'
    regions=[('California',[-124,32,-114,42]),('Northern California',[-124,38,-120,42]),('Central Valley',[-122,35,-119,39])]
    series={}
    for name,box in regions:
        query=dict(ds='TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06_V2_LAND',b=','.join(map(str,box)),
                   startTime='2011-01-01T00:00:00Z',endTime='2017-06-30T23:59:59Z')
        data=json.loads(fetch(base+urlencode(query)))
        series[name]=data
    save('water-readings',series)
    # GIBS dates are the archive's published month starts, with gaps retained.
    def one(day):
        name=map_image('GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI',day,bounds,'water-'+day,640,560)
        return dict(day=day,image=name)
    months=[f'{y}-{m:02}-01' for y in range(2011,2018) for m in range(1,13) if y<2017 or m<=6]
    with ThreadPoolExecutor(max_workers=4) as p:frames=list(p.map(one,months))
    save('water',dict(bounds=bounds,frames=[f for f in frames if f['image']]))


if __name__=='__main__':
    tasks=dict(fault=fault,fire=fire,comet=comet,north=north,ice=ice,dust=dust,ozone=ozone,water=water)
    for name in sys.argv[1:] or tasks:
        print(name,flush=True);MANIFEST.clear();tasks[name]()
        save(name+'-provenance',dict(retrieved=datetime.now(timezone.utc).date().isoformat(),inputs=MANIFEST))
