"""Extract dated MODIS observations without filling cloud or coverage gaps."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import sys

from atlas_archive import days, gibs, provenance, save


def bloom():
    bounds = [-50, 38, 5, 68]
    def one(day):
        return dict(day=day,
                    image=gibs('MODIS_Aqua_L2_Chlorophyll_A', day, bounds, 'bloom-' + day, (768, 512)),
                    natural=gibs('MODIS_Aqua_CorrectedReflectance_TrueColor', day, bounds, 'bloom-natural-' + day, (768, 512)))
    with ThreadPoolExecutor(max_workers=4) as pool:
        frames = list(pool.map(one, days('2024-04-15', '2024-06-30', 3)))
    save('bloom', dict(bounds=bounds, frames=frames))


def spring():
    bounds = [-180, -60, 180, 85]
    def one(day):
        end = min(datetime.fromisoformat(day) + timedelta(days=15), datetime(int(day[:4]), 12, 31))
        return dict(day=day, end=end.strftime('%Y-%m-%d'),
                    image=gibs('MODIS_Terra_L3_NDVI_16Day', day, bounds, 'spring-' + day, (1024, 416)))
    with ThreadPoolExecutor(max_workers=4) as pool:
        frames = list(pool.map(one, [day for year in [2023, 2024] for day in days(f'{year}-01-01', f'{year}-12-31', 16)]))
    save('spring', dict(bounds=bounds, frames=frames))


if __name__ == '__main__':
    for name in sys.argv[1:]:
        globals()[name]()
        provenance(name)
        print(name, 'ready', flush=True)
