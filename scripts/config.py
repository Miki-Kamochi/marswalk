"""Shared constants for the Marswalk data pipeline.

Map frame used everywhere: Mars equirectangular, sphere R=3396190 m, lat_0=0, lon_0=0
(the frame of the USGS MSL Gale mosaics and of the Curiosity waypoint easting/northing).
  easting  = R * lon_east_radians
  northing = R * lat_radians
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PUBLIC_DATA = ROOT / "public" / "data"

MARS_RADIUS_M = 3396190.0

# Raw fetch window around Curiosity's Murray Buttes -> Vera Rubin Ridge route
# (west, south, east, north) in metres. 4.0 km x 4.5 km.
FETCH_BOUNDS = (8140200.0, -281300.0, 8144200.0, -276800.0)

# Play area actually shipped to the browser (subset of FETCH_BOUNDS). 3.0 km x 3.6 km.
PLAY_BOUNDS = (8140700.0, -280900.0, 8143700.0, -277300.0)

USGS = "https://planetarymaps.usgs.gov/mosaic"
GALE_DEM_URL = f"{USGS}/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif"            # 1 m, float32
GALE_ORTHO_URL = f"{USGS}/Mars/MSL/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif"  # 0.25 m, uint8
MOLA_URL = f"{USGS}/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"              # 463 m, int16
MID_DECIMATE = 20          # whole Gale DEM mosaic sampled every 20 m for the mid-distance backdrop
MOLA_HALF_WINDOW_M = 130000.0  # +-130 km around the centre of Gale for the far backdrop
GALE_CENTER_LONLAT = (137.8, -5.4)

# HiRISE colour strip (IR / red / blue-green), used only to derive a grey->colour lookup
HIRISE_BASE = ("https://www.uahirise.org/PDS/DTM/PSP/ORB_009600_009699/"
               "PSP_009650_1755_PSP_009716_1755")
HIRISE_ORTHO_IRB = "PSP_009650_1755_IRB_C_01_ORTHO.JP2"
HIRISE = dict(scale=1.0117671078927, line_offset=-257882.5, sample_offset=4397.5, center_lon=137.31)
# where the colour strip overlaps the Gale mosaic, used for colour calibration (w, s, e, n)
COLOR_CAL_BOUNDS = (8139000.0, -280000.0, 8140000.0, -278500.0)

# CRISM map-projected targeted observation covering Vera Rubin Ridge
CRISM_BASE = ("https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/"
              "mrocr_4001/mtrdr/2008/2008_191/frt0000b6f1")
CRISM_SR = "frt0000b6f1_07_sr165j_mtr3"   # refined spectral summary parameters, 18 m/px

MSL_WAYPOINTS_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"
REMS_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
