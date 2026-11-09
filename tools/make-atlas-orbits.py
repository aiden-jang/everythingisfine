"""JPL geocentric observer ephemerides; orbital positions remain at physical scale."""
import csv
from datetime import datetime, timezone
import json
import sys
from urllib.parse import urlencode

from atlas_archive import fetch, provenance, save


def ephemeris(command, start, end, step):
    query = dict(format='json', COMMAND=f"'{command}'", CENTER="'500@399'", MAKE_EPHEM="'YES'",
                 EPHEM_TYPE="'OBSERVER'", START_TIME=f"'{start}'", STOP_TIME=f"'{end}'",
                 STEP_SIZE=f"'{step}'", QUANTITIES="'2,20,23'", CSV_FORMAT="'YES'", ANG_FORMAT="'DEG'")
    url = 'https://ssd.jpl.nasa.gov/api/horizons.api?' + urlencode(query)
    result = json.loads(fetch(url))['result']
    rows = []
    for row in csv.reader(result.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()):
        at = datetime.strptime(row[0].strip(), '%Y-%b-%d %H:%M').replace(tzinfo=timezone.utc)
        rows.append([int(at.timestamp() * 1000), float(row[3]), float(row[4]), float(row[5]), float(row[7])])
    return rows


def apophis():
    save('apophis', dict(samples=ephemeris('99942', '2029-04-13 12:00', '2029-04-14 03:00', '2 m')))


def eclipse():
    save('eclipse', dict(moon=ephemeris('301', '2025-03-14 03:30', '2025-03-14 10:30', '1 m'),
                         sun=ephemeris('10', '2025-03-14 03:30', '2025-03-14 10:30', '1 m')))


if __name__ == '__main__':
    for name in sys.argv[1:]:
        globals()[name]()
        provenance(name)
        print(name, 'ready', flush=True)
