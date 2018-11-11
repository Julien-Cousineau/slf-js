import proj4 from 'proj4';

proj4.defs('EPSG:4326','+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees');
proj4.defs('EPSG:4269','+title=NAD83 (long/lat) +proj=longlat +a=6378137.0 +b=6356752.31414036 +ellps=GRS80 +datum=NAD83 +units=degrees');
proj4.defs('EPSG:3156','+proj=utm +zone=9 +ellps=GRS80 +units=m +no_defs ');
proj4.defs('EPSG:3159','+proj=utm +zone=15 +ellps=GRS80 +units=m +no_defs');
proj4.defs('EPSG:3857','+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs');

export default proj4;
