const proj4 = require('proj4');

proj4.defs('EPSG:4326','+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees');
proj4.defs('EPSG:4269','+title=NAD83 (long/lat) +proj=longlat +a=6378137.0 +b=6356752.31414036 +ellps=GRS80 +datum=NAD83 +units=degrees');
proj4.defs('EPSG:3156','+proj=utm +zone=9 +ellps=GRS80 +units=m +no_defs ');
proj4.defs('EPSG:3159','+proj=utm +zone=15 +ellps=GRS80 +units=m +no_defs');


module.exports =  proj4;
