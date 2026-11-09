"""A dated GFS fallback, kept distinct from the current public forecast."""
from urllib.parse import urlencode
from atlas_archive import OUT, fetch, provenance

query = [('var', name) for name in ['Specific_humidity_isobaric', 'u-component_of_wind_isobaric',
         'v-component_of_wind_isobaric', 'Pressure_surface', 'Precipitation_rate_surface']]
query += [('north', 60), ('south', 15), ('west', -175), ('east', -110), ('horizStride', 12),
          ('time_start', '2026-11-09T12:00:00Z'), ('time_end', '2026-11-10T12:00:00Z'),
          ('timeStride', 2), ('accept', 'netcdf')]
url = 'https://thredds.ucar.edu/thredds/ncss/grid/grib/NCEP/GFS/Global_0p25deg/Best?' + urlencode(query)
(OUT / 'river.nc').write_bytes(fetch(url))
provenance('river')
