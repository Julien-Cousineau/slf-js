(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('proj4'), require('@turf/helpers'), require('@turf/area'), require('@turf/mask'), require('@julien.cousineau/util'), require('rbush'), require('@mapbox/tile-cover'), require('@mapbox/tilebelt'), require('@turf/bbox-polygon')) :
typeof define === 'function' && define.amd ? define(['exports', 'proj4', '@turf/helpers', '@turf/area', '@turf/mask', '@julien.cousineau/util', 'rbush', '@mapbox/tile-cover', '@mapbox/tilebelt', '@turf/bbox-polygon'], factory) :
(factory((global['slf-js'] = {}),global.proj4,global.helpers,global.area,global.mask,global.util,global.rbush,global.cover,global.tilebelt,global.bboxPolygon));
}(this, (function (exports,proj4,helpers,area,mask,util,rbush,cover,tilebelt,bboxPolygon) { 'use strict';

proj4 = proj4 && proj4.hasOwnProperty('default') ? proj4['default'] : proj4;
area = area && area.hasOwnProperty('default') ? area['default'] : area;
mask = mask && mask.hasOwnProperty('default') ? mask['default'] : mask;
rbush = rbush && rbush.hasOwnProperty('default') ? rbush['default'] : rbush;
cover = cover && cover.hasOwnProperty('default') ? cover['default'] : cover;
tilebelt = tilebelt && tilebelt.hasOwnProperty('default') ? tilebelt['default'] : tilebelt;
bboxPolygon = bboxPolygon && bboxPolygon.hasOwnProperty('default') ? bboxPolygon['default'] : bboxPolygon;

/*!
 *  Copyright 2008 Fair Oaks Labs, Inc.
 *  All rights reserved.
 */

// Utility object:  Encode/Decode C-style binary primitives to/from octet arrays
function BufferPack() {
  // Module-level (private) variables
  var el,  bBE = false, m = this;

  // Raw byte arrays
  m._DeArray = function (a, p, l) {
    return [a.slice(p,p+l)];
  };
  m._EnArray = function (a, p, l, v) {
    for (var i = 0; i < l; a[p+i] = v[i]?v[i]:0, i++){ }
  };

  // ASCII characters
  m._DeChar = function (a, p) {
    return String.fromCharCode(a[p]);
  };
  m._EnChar = function (a, p, v) {
    a[p] = v.charCodeAt(0);
  };

  // Little-endian (un)signed N-byte integers
  m._DeInt = function (a, p) {
    var lsb = bBE?(el.len-1):0, nsb = bBE?-1:1, stop = lsb+nsb*el.len, rv, i, f;
    for (rv = 0, i = lsb, f = 1; i != stop; rv+=(a[p+i]*f), i+=nsb, f*=256){ }
    if (el.bSigned && (rv & Math.pow(2, el.len*8-1))) {
      rv -= Math.pow(2, el.len*8);
    }
    return rv;
  };
  m._EnInt = function (a, p, v) {
    var lsb = bBE?(el.len-1):0, nsb = bBE?-1:1, stop = lsb+nsb*el.len, i;
    v = (v<el.min)?el.min:(v>el.max)?el.max:v;
    for (i = lsb; i != stop; a[p+i]=v&0xff, i+=nsb, v>>=8){ }
  };

  // ASCII character strings
  m._DeString = function (a, p, l) {
    for (var rv = new Array(l), i = 0; i < l; rv[i] = String.fromCharCode(a[p+i]), i++){ }
    return rv.join('');
  };
  m._EnString = function (a, p, l, v) {
    for (var t, i = 0; i < l; a[p+i] = (t=v.charCodeAt(i))?t:0, i++){ }
  };

  // ASCII character strings null terminated
  m._DeNullString = function (a, p, l, v) {
    var str = m._DeString(a, p, l, v);
    return str.substring(0, str.length - 1);
  };

  // Little-endian N-bit IEEE 754 floating point
  m._De754 = function (a, p) {
    var s, e, m, i, d, nBits, mLen, eLen, eBias, eMax;
    mLen = el.mLen, eLen = el.len*8-el.mLen-1, eMax = (1<<eLen)-1, eBias = eMax>>1;

    i = bBE?0:(el.len-1); d = bBE?1:-1; s = a[p+i]; i+=d; nBits = -7;
    for (e = s&((1<<(-nBits))-1), s>>=(-nBits), nBits += eLen; nBits > 0; e=e*256+a[p+i], i+=d, nBits-=8){ }
    for (m = e&((1<<(-nBits))-1), e>>=(-nBits), nBits += mLen; nBits > 0; m=m*256+a[p+i], i+=d, nBits-=8){ }

    switch (e) {
    case 0:
      // Zero, or denormalized number
      e = 1-eBias;
      break;
    case eMax:
      // NaN, or +/-Infinity
      return m?NaN:((s?-1:1)*Infinity);
    default:
      // Normalized number
      m = m + Math.pow(2, mLen);
      e = e - eBias;
      break;
    }
    return (s?-1:1) * m * Math.pow(2, e-mLen);
  };
  m._En754 = function (a, p, v) {
    var s, e, m, i, d, c, mLen, eLen, eBias, eMax;
    mLen = el.mLen, eLen = el.len*8-el.mLen-1, eMax = (1<<eLen)-1, eBias = eMax>>1;

    s = v<0?1:0;
    v = Math.abs(v);
    if (isNaN(v) || (v == Infinity)) {
      m = isNaN(v)?1:0;
      e = eMax;
    } else {
      e = Math.floor(Math.log(v)/Math.LN2);			// Calculate log2 of the value

      if (v*(c = Math.pow(2, -e)) < 1) {
        e--; c*=2;						// Math.log() isn't 100% reliable
      }

      // Round by adding 1/2 the significand's LSD
      if (e+eBias >= 1) {
        v += el.rt/c;                                           // Normalized:  mLen significand digits
      } else {
        v += el.rt*Math.pow(2, 1-eBias);                        // Denormalized:  <= mLen significand digits
      }

      if (v*c >= 2) {
        e++; c/=2;						// Rounding can increment the exponent
      }

      if (e+eBias >= eMax) {
        // Overflow
        m = 0;
        e = eMax;
      } else if (e+eBias >= 1) {
        // Normalized - term order matters, as Math.pow(2, 52-e) and v*Math.pow(2, 52) can overflow
        m = (v*c-1)*Math.pow(2, mLen);
        e = e + eBias;
      } else {
        // Denormalized - also catches the '0' case, somewhat by chance
        m = v*Math.pow(2, eBias-1)*Math.pow(2, mLen);
        e = 0;
      }
    }

    for (i = bBE?(el.len-1):0, d=bBE?-1:1; mLen >= 8; a[p+i]=m&0xff, i+=d, m/=256, mLen-=8){ }
    for (e=(e<<mLen)|m, eLen+=mLen; eLen > 0; a[p+i]=e&0xff, i+=d, e/=256, eLen-=8){ }
    a[p+i-d] |= s*128;
  };

  // Class data
  m._sPattern = '(\\d+)?([AxcbBhHsSfdiIlL])(\\(([a-zA-Z0-9]+)\\))?';
  m._lenLut = {'A': 1, 'x': 1, 'c': 1, 'b': 1, 'B': 1, 'h': 2, 'H': 2, 's': 1,
               'S': 1, 'f': 4, 'd': 8, 'i': 4, 'I': 4, 'l': 4, 'L': 4};
  m._elLut = {'A': {en: m._EnArray, de: m._DeArray},
              's': {en: m._EnString, de: m._DeString},
              'S': {en: m._EnString, de: m._DeNullString},
              'c': {en: m._EnChar, de: m._DeChar},
              'b': {en: m._EnInt, de: m._DeInt, len: 1, bSigned: true, min: -Math.pow(2, 7), max: Math.pow(2, 7) - 1},
              'B': {en: m._EnInt, de: m._DeInt, len: 1, bSigned: false, min: 0, max: Math.pow(2, 8) - 1},
              'h': {en: m._EnInt, de: m._DeInt, len: 2, bSigned: true, min: -Math.pow(2, 15), max: Math.pow(2, 15) - 1},
              'H': {en: m._EnInt, de: m._DeInt, len: 2, bSigned: false, min: 0, max: Math.pow(2, 16) - 1},
              'i': {en: m._EnInt, de: m._DeInt, len: 4, bSigned: true, min: -Math.pow(2, 31), max: Math.pow(2, 31) - 1},
              'I': {en: m._EnInt, de: m._DeInt, len: 4, bSigned: false, min: 0, max: Math.pow(2, 32) - 1},
              'l': {en: m._EnInt, de: m._DeInt, len: 4, bSigned: true, min: -Math.pow(2, 31), max: Math.pow(2, 31) - 1},
              'L': {en: m._EnInt, de: m._DeInt, len: 4, bSigned: false, min: 0, max: Math.pow(2, 32) - 1},
              'f': {en: m._En754, de: m._De754, len: 4, mLen: 23, rt: Math.pow(2, -24) - Math.pow(2, -77)},
              'd': {en: m._En754, de: m._De754, len: 8, mLen: 52, rt: 0}};

  // Unpack a series of n elements of size s from array a at offset p with fxn
  m._UnpackSeries = function (n, s, a, p) {
    for (var fxn = el.de, rv = [], i = 0; i < n; rv.push(fxn(a, p+i*s)), i++){ }
    return rv;
  };

  // Pack a series of n elements of size s from array v at offset i to array a at offset p with fxn
  m._PackSeries = function (n, s, a, p, v, i) {
    for (var fxn = el.en, o = 0; o < n; fxn(a, p+o*s, v[i+o]), o++){ }
  };

  m._zip = function (keys, values) {
    var result = {};

    for (var i = 0; i < keys.length; i++) {
      result[keys[i]] = values[i];
    }

    return result;
  };

  // Unpack the octet array a, beginning at offset p, according to the fmt string
  m.unpack = function (fmt, a, p) {
    // Set the private bBE flag based on the format string - assume big-endianness
    bBE = (fmt.charAt(0) != '<');

    p = p?p:0;
    var re = new RegExp(this._sPattern, 'g');
    var m;
    var n;
    var s;
    var rk = [];
    var rv = [];

    while (m = re.exec(fmt)) {
      n = ((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1]);

      if(m[2] === 'S') { // Null term string support
        n = 0; // Need to deal with empty  null term strings
        while(a[p + n] !== 0) {
          n++;
        }
        n++; // Add one for null byte
      }

      s = this._lenLut[m[2]];

      if ((p + n*s) > a.length) {
        return undefined;
      }

      switch (m[2]) {
      case 'A': case 's': case 'S':
        rv.push(this._elLut[m[2]].de(a, p, n));
        break;
      case 'c': case 'b': case 'B': case 'h': case 'H':
      case 'i': case 'I': case 'l': case 'L': case 'f': case 'd':
        el = this._elLut[m[2]];
        rv.push(this._UnpackSeries(n, s, a, p));
        break;
      }

      rk.push(m[4]); // Push key on to array

      p += n*s;
    }

    rv = Array.prototype.concat.apply([], rv);

    if(rk.indexOf(undefined) !== -1) {
      return rv;
    } else {
      return this._zip(rk, rv);
    }
  };

  // Pack the supplied values into the octet array a, beginning at offset p, according to the fmt string
  m.packTo = function (fmt, a, p, values) {
    // Set the private bBE flag based on the format string - assume big-endianness
    bBE = (fmt.charAt(0) != '<');

    var re = new RegExp(this._sPattern, 'g');
    var m;
    var n;
    var s;
    var i = 0;
    var j;

    while (m = re.exec(fmt)) {
      n = ((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1]);

      // Null term string support
      if(m[2] === 'S') {
        n = values[i].length + 1; // Add one for null byte
      }

      s = this._lenLut[m[2]];

      if ((p + n*s) > a.length) {
        return false;
      }

      switch (m[2]) {
      case 'A': case 's': case 'S':
        if ((i + 1) > values.length) { return false; }
        this._elLut[m[2]].en(a, p, n, values[i]);
        i += 1;
        break;
      case 'c': case 'b': case 'B': case 'h': case 'H':
      case 'i': case 'I': case 'l': case 'L': case 'f': case 'd':
        el = this._elLut[m[2]];
        if ((i + n) > values.length) { return false; }
        this._PackSeries(n, s, a, p, values, i);
        i += n;
        break;
      case 'x':
        for (j = 0; j < n; j++) { a[p+j] = 0; }
        break;
      }
      p += n*s;
    }

    return a;
  };

  // Pack the supplied values into a new octet array, according to the fmt string
  m.pack = function (fmt, values) {
    return this.packTo(fmt, new Buffer(this.calcLength(fmt, values)), 0, values);
  };

  // Determine the number of bytes represented by the format string
  m.calcLength = function (format, values) {
    var re = new RegExp(this._sPattern, 'g'), m, sum = 0, i = 0;
    while (m = re.exec(format)) {
      var n = (((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1])) * this._lenLut[m[2]];

      if(m[2] === 'S') {
        n = values[i].length + 1; // Add one for null byte
      }

      sum += n;
      if(m[2] !== 'x') {
        i++;
      }
    }
    return sum;
  };
}
var bufferpack = new BufferPack();

proj4.defs('EPSG:4326','+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees');
proj4.defs('EPSG:4269','+title=NAD83 (long/lat) +proj=longlat +a=6378137.0 +b=6356752.31414036 +ellps=GRS80 +datum=NAD83 +units=degrees');
proj4.defs('EPSG:3156','+proj=utm +zone=9 +ellps=GRS80 +units=m +no_defs ');
proj4.defs('EPSG:3159','+proj=utm +zone=15 +ellps=GRS80 +units=m +no_defs');
proj4.defs('EPSG:3857','+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs');

// 'use strict';


// const bufferpack = new _bufferpack();



/**
 * Create Selafin Object - opentelemac.org
 * @param {Buffer} buffer - Buffer containing binary information
 * @param {Object} options - Optional information
 * @returns {Object} Selafin - a Selafin object
 */
var Selafin = function Selafin(buffer,options){
if(!options){ options={}; }
this.fromProj = options.fromProj || 'EPSG:4326';
this.toProj = options.toProj || 'EPSG:4326';
// this.keepbuffer = options.keepbuffer || 0;
this.keepframes = (typeof options.keepframes==='undefined')?true:options.keepframes;
this.debug = options.debug || 0;
(buffer)?this.initialised(buffer):this.initialisedBlank();
};

var prototypeAccessors = { TRIXY: { configurable: true },varnames: { configurable: true },XY: { configurable: true },IKLEW: { configurable: true },EDGES: { configurable: true },BEDGES: { configurable: true },IEDGES: { configurable: true },CX: { configurable: true },CY: { configurable: true },TRIAREA: { configurable: true },TRIBBOX: { configurable: true },BBOX: { configurable: true },EXTENT: { configurable: true },POLYGON: { configurable: true },EXTERIOR: { configurable: true },INTERIORS: { configurable: true },POLYGONS: { configurable: true } };
Selafin.prototype.initialisedBlank = function initialisedBlank (){
  this.file = {endian:'>',float:['f',4]};
  this.TITLE = '';
  this.NBV1 = 0; this.NBV2 = 0; this.NVAR = this.NBV1 + this.NBV2;
  this.VARINDEX = util.range(this.NVAR);
  this.IPARAM = [];
  this.NELEM3 = 0; this.NPOIN3 = 0; this.NDP3 = 0; this.NPLAN = 1;
  this.NELEM2 = 0; this.NPOIN2 = 0; this.NDP2 = 0;
  this.NBV1 = 0; this.VARNAMES = []; this.VARUNITS = [];
  this.NBV2 = 0; this.CLDNAMES = []; this.CLDUNITS = [];
  this.IKLE3 = []; this.IKLE2 = []; this.IPOB2 = []; this.IPOB3 = []; this.MESHX = []; this.MESHY = [];
  this.tags = {cores:[],times:[]};
  this.NFRAME = 0;
};
Selafin.prototype.initialised = function initialised (buffer){
  var debug = this.debug;
  if (debug) { console.time('Initialised selafin object'); }
    
  // ~~> Convert buffer to uint8array
  if (debug) { console.time('Buffer to Uint8Array'); }
  this.uint8array = new Uint8Array(buffer);
  if (debug) { console.timeEnd('Buffer to Uint8Array'); }
    
  // ~~> Initialised file object and check endian encoding
  this.file = {};
  this.file.endian = this.getEndianFromChar(80);
    
  // ~~> header parameters
  var pos=this.getHeaderMetaDataSLF();
    
  // ~~> connectivity
  if (debug) { console.time('Get connectivity matrix'); }
  var posHeader=this.getHeaderIntegersSLF(pos);
  if (debug) { console.timeEnd('Get connectivity matrix'); }
    
  // ~~> modify connectivity matrix : Change id to index 
  if (debug) { console.time('Change connectivity matrix: id to index'); }
  this.IKLE3.add(-1);
  if (debug) { console.timeEnd('Change connectivity matrix: id to index'); }
    
  // ~~> modify connectivity matrix : Reordering matrix
  if (debug) { console.time('Reorder connectivity matrix'); }
  this.IKLE3F = this.IKLE3;
  this.IKLE3 = this.reshapeIKLE();
  if (debug) { console.timeEnd('Reorder connectivity matrix'); }
    
  // ~~> checks float encoding
  this.file.float = this.getFloatTypeFromFloat(posHeader);
    
  // ~~> xy mesh
  if (debug) { console.time('Get mesh XY'); }
  var posTS = this.getHeaderFloatsSLF(posHeader);
  if (debug) { console.timeEnd('Get mesh XY'); }

  // ~~> frames
  if (debug) { console.time('Get frame tags'); }
  this.tags =this.getTimeHistorySLF(posTS);
  if (debug) { console.timeEnd('Get frame tags'); }
    
    
    
  // ~~> keeping buffer?
  // if (!(keepbuffer)) this.uint8array = null;
  if(this.keepframes){ this.getFrames(); }
    
  // ~~> transform xy mesh
  if (debug) { console.time('Transform mesh XY'); }
  this.transform();
  if (debug) { console.timeEnd('Transform mesh XY'); }
    
  // ~~> min/max values
  // if (debug) console.time('Get min/max');
  // this.minmax = this.getMinMax();
  // if (debug) console.timeEnd('Get min/max');
    
  this.initializeProperties();

    
  if (debug) {
    console.timeEnd('Initialised selafin object');
    console.log("NELEM:%d,NPOIN:%d,NFRAME:%d",this.NELEM3,this.NPOIN3,this.NFRAME);
  }
};
Selafin.prototype.initializeProperties = function initializeProperties (){
  // ~~> initialize dynamic properties
  this._TRIXY = null;
  this._TRIAREA = null;
  this._CX = null;
  this._CY = null;
  this._EDGES = null;
  this._BEDGES = null;
  this._IEDGES = null;
};
Selafin.prototype.getEndianFromChar = function getEndianFromChar (nchar){
    var assign, assign$1;

  var uint8array =this.uint8array;
  var endian = ">"; // "<" means little-endian, ">" means big-endian
  var l,c,chk;
  (assign = bufferpack.unpack(endian+'i'+ nchar +'si',uint8array,0), l = assign[0], c = assign[1], chk = assign[2]);
  if (chk!=nchar){
      endian = "<";
      (assign$1 = bufferpack.unpack(endian+'i'+ nchar +'si',uint8array,0), l = assign$1[0], c = assign$1[1], chk = assign$1[2]);
  }
  if (l!=chk){
      throw Error('... Cannot read '+ nchar +' characters from your binary file +> Maybe it is the wrong file format ?');
  }
  return endian;
};
Selafin.prototype.getHeaderMetaDataSLF = function getHeaderMetaDataSLF (){
    var assign, assign$1, assign$2, assign$3;

  var uint8array =this.uint8array;
  var endian = this.file.endian;
  var l,chk;
  var pos=0;
  // ~~ Read title ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  (assign = bufferpack.unpack(endian+'i80si',uint8array,pos), l = assign[0], this.TITLE = assign[1], chk = assign[2]);
  pos+=4+80+4;
  // ~~ Read NBV(1) and NBV(2) ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  (assign$1 = bufferpack.unpack(endian+'iiii',uint8array,pos), l = assign$1[0], this.NBV1 = assign$1[1], this.NBV2 = assign$1[2], chk = assign$1[3]);
  pos+=4+8+4;
  this.NVAR = this.NBV1 + this.NBV2;
  this.VARINDEX = util.range(this.NVAR,'Uint8Array');
  // ~~ Read variable names and units ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  this.VARNAMES = []; this.VARUNITS = [];
  this.CLDNAMES = []; this.CLDUNITS = [];
  for(var i=0;i<this.NBV1;i++){
    var vn = (void 0),vu = (void 0);
    (assign$2 = bufferpack.unpack(endian+'i16s16si',uint8array,pos), l = assign$2[0], vn = assign$2[1], vu = assign$2[2], chk = assign$2[3]);
    pos+=4+16+16+4;
    this.VARNAMES.push(vn);
    this.VARUNITS.push(vu);
  }
  for(var i$1=0;i$1<this.NBV2;i$1++){
    var vn$1 = (void 0),vu$1 = (void 0);
    (assign$3 = bufferpack.unpack(endian+'i16s16si',uint8array,pos), l = assign$3[0], vn$1 = assign$3[1], vu$1 = assign$3[2], chk = assign$3[3]);
    pos+=4+16+16+4;
    this.CLDNAMES.push(vn$1);
    this.CLDUNITS.push(vu$1);      
  }

  // ~~ Read IPARAM array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  var d = bufferpack.unpack(endian+'12i',uint8array,pos);
  pos+=4+40+4;
  this.IPARAM = d.slice(1, 11);
  // ~~ Projection~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  this.PROJ = this.IPARAM[1];
  // ~~ Read DATE/TIME array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  this.DATETIME = new Uint16Array([1972,7,13,17,15,13]);
  if (this.IPARAM[9] == 1){
    d = bufferpack.unpack(endian+'8i',pos);
    pos+=4+24+4;
    this.DATETIME = d.slice(1, 9);
  }
  return pos;
};
Selafin.prototype.getHeaderIntegersSLF = function getHeaderIntegersSLF (pos){
    var assign;

  var uint8array =this.uint8array;
  var endian = this.file.endian;
  var l,chk;
    
  // ~~ Read NELEM3, NPOIN3, NDP3, NPLAN ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  (assign = bufferpack.unpack(endian+'6i',uint8array,pos), l = assign[0], this.NELEM3 = assign[1], this.NPOIN3 = assign[2], this.NDP3 = assign[3], this.NPLAN = assign[4], chk = assign[5]);
  pos+=4+16+4;
  this.NELEM2 = this.NELEM3;
  this.NPOIN2 = this.NPOIN3;
  this.NDP2 = this.NDP3;
  this.NPLAN = Math.max(1,this.NPLAN);
    
    
  if (this.IPARAM[6] > 1){
     this.NPLAN = this.IPARAM[6]; // /!\ How strange is that ?
     this.NELEM2 = this.NELEM3 / (this.NPLAN - 1);
     this.NPOIN2 = this.NPOIN3 / this.NPLAN;
     this.NDP2 = this.NDP3 / 2;
  }
  // ~~ Read the IKLE array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  pos+=4;
  this.IKLE3 = new Uint32Array(bufferpack.unpack(endian+(this.NELEM3*this.NDP3)+'i',uint8array,pos));
  pos+=4*this.NELEM3*this.NDP3;
  pos+=4;
    
  if (this.NPLAN > 1){
    // this.IKLE2 = np.compress( np.repeat([True,False],this.NDP2), this.IKLE3[0:this.NELEM2], axis=1 )
    throw Error("Check Javascript for 3D");
  }
  // ~~ Read the IPOBO array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  pos+=4;
  // WARNING - NOT SAVING IPOB3
  this.IPOB3 = new Uint32Array(bufferpack.unpack(endian+this.NPOIN3+'i',uint8array,pos));
  pos+=4*this.NPOIN3;
  pos+=4;
  // this.IPOB2 = this.IPOB3.slice(0,this.NPOIN2);
  return pos;
};
Selafin.prototype.getFloatTypeFromFloat = function getFloatTypeFromFloat (pos){
    
  var uint8array =this.uint8array;
  var endian = this.file.endian;
  var nfloat = this.NPOIN3;
  var ifloat = 4;
  var cfloat = 'f';
  var l = bufferpack.unpack(endian+'i',uint8array,pos);
  pos +=4;
    
  if (l[0]!=ifloat*nfloat){
    ifloat = 8;
    cfloat = 'd';
  }
  pos +=ifloat*nfloat;
  var chk = bufferpack.unpack(endian+'i',uint8array,pos);
  if (l[0]!=chk[0]){ throw Error('... Cannot read '+nfloat+' floats from your binary file +> Maybe it is the wrong file format ?'); }
  return [cfloat,ifloat];          
};
Selafin.prototype.getHeaderFloatsSLF = function getHeaderFloatsSLF (pos){
    var uint8array =this.uint8array;
    var endian = this.file.endian;
    var ref = this.file.float;
      var ftype = ref[0];
      var fsize = ref[1];
    // ~~ Read the x-coordinates of the nodes ~~~~~~~~~~~~~~~~~~
    pos +=4;
    this.MESHX = new Float32Array(bufferpack.unpack(endian+this.NPOIN3+ftype,uint8array,pos));
    pos +=fsize*this.NPOIN3;
    pos +=4;
    // ~~ Read the y-coordinates of the nodes ~~~~~~~~~~~~~~~~~~
    pos +=4;
    this.MESHY = new Float32Array(bufferpack.unpack(endian+this.NPOIN3+ftype,uint8array,pos));
    pos +=fsize*this.NPOIN3;
    pos +=4;
    return pos;
};
Selafin.prototype.getTimeHistorySLF = function getTimeHistorySLF (pos){
  var uint8array =this.uint8array;
  var endian = this.file.endian;
  var ref = this.file.float;
    var ftype = ref[0];
    var fsize = ref[1];

  varATs = [], ATt = [];
  while (true){
     try{
        ATt.push(pos);
        // ~~ Read AT ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        pos +=4;
        ATs.push(bufferpack.unpack(endian+ftype,uint8array,pos)[0]);
        pos +=fsize;
        pos +=4;
        // ~~ Skip Values ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        pos+=this.NVAR*(4+fsize*this.NPOIN3+4);
     }
     catch(error){
        ATt.pop(ATt.length-1); // since the last record failed the try
        break;
     }
  }
  this.NFRAME = ATs.length;
  return { 'cores':ATt,'times':new Float32Array(ATs)};
};
  
Selafin.prototype.writeHeaderSLF = function writeHeaderSLF (){
  var endian = this.file.endian;    
  var ref = this.file.float;
    var ftype = ref[0];
    var fsize = ref[1];
  var buffer = new Buffer(0);
  // ~~ Write title ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  buffer = Buffer.concat([buffer,bufferpack.pack(endian+'i80si',[80,this.TITLE,80])]);
  // ~~ Write NBV(1) and NBV(2) ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'iiii',[4+4,this.NBV1,this.NBV2,4+4])]);
  // ~~ Write variable names and units ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  for(var i=0;i<this.NBV1;i++){
    buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i16s16si',[32,this.VARNAMES[i],this.VARUNITS[i],32])]);
  }
  for(var i$1=0;i$1<this.NBV2;i$1++){
    buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i16s16si',[32,this.CLDNAMES[i$1],this.CLDUNITS[i$1],32])]);
  }    
  // ~~ Write IPARAM array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*10])]);
   for(var i$2=0;i$2<this.IPARAM.length;i$2++){
     buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[this.IPARAM[i$2]])]);
   }
   buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*10])]);
  // ~~ Write DATE/TIME array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  if (this.IPARAM[9] == 1){
    buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*6])]);
    for(var i$3=0;i$3<6;i$3++){
      buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[this.DATETIME[i$3]])]);
    }
    buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*6])]);      
  }
    
  // ~~ Write NELEM3, NPOIN3, NDP3, NPLAN ~~~~~~~~~~~~~~~~~~~~~~~~~~~
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'6i',[4*4,this.NELEM3,this.NPOIN3,this.NDP3,1,4*4])]);// /!\ TODO is NPLAN ?
  // ~~ Write the IKLE array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*this.NELEM3*this.NDP3])]);
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'{0}i'.format(this.NELEM3*this.NDP3),this.IKLE3F.add(1))]); // TODO change IKLEF to IKLE ; index to id;
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*this.NELEM3*this.NDP3])]);
  // ~~ Write the IPOBO array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*this.NPOIN3])]);
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+(this.NPOIN3+'i'),this.IPOB3)]);
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*this.NPOIN3])]);
  // ~~ Write the x-coordinates of the nodes ~~~~~~~~~~~~~~~~~~~~~~~
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
  //f.write(pack(endian+str(self.NPOIN3)+ftype,*(np.tile(self.MESHX,self.NPLAN))))
  for(var i$4=0;i$4<this.NPLAN;i$4++){
    buffer=Buffer.concat([buffer,bufferpack.pack(endian+(this.NPOIN2+ftype),this.MESHX)]);
  }
    
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
  // ~~ Write the y-coordinates of the nodes ~~~~~~~~~~~~~~~~~~~~~~~
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
  //f.write(pack(endian+str(self.NPOIN3)+ftype,*(np.tile(self.MESHX,self.NPLAN))))
  for(var i$5=0;i$5<this.NPLAN;i$5++){
    buffer=Buffer.concat([buffer,bufferpack.pack(endian+(this.NPOIN2+ftype),this.MESHY)]);
  }
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
  return buffer;
};
Selafin.prototype.writeCoreTimeSLF = function writeCoreTimeSLF (buffer,t){
  var endian = this.file.endian;    
  var ref = this.file.float;
    var ftype = ref[0];
    var fsize = ref[1];
  // Print time record
  var _t =(this.tags['times'].length==0 || !this.tags['times'][t])?t:this.tags['times'][t];
  buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i'+ftype+'i',[fsize,_t,fsize])]);
  return buffer;
};
Selafin.prototype.writeCoreVarSLF = function writeCoreVarSLF (buffer,t){
  var endian = this.file.endian;    
  var ref = this.file.float;
    var ftype = ref[0];
    var fsize = ref[1];    
  // Print variable records
  for(var i=0;i<this.NVAR;i++){
    var frame = this.getFrame(t,i);
    buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
    buffer=Buffer.concat([buffer,bufferpack.pack(endian+(this.NPOIN3+ftype),frame)]);
    buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
  }
  return buffer;
};
Selafin.prototype.getBuffer = function getBuffer (){
  var buffer=this.writeHeaderSLF();
  for(var i=0;i<this.NFRAME;i++){
    buffer=this.writeCoreTimeSLF(buffer,i);
    buffer=this.writeCoreVarSLF(buffer,i);
  }
  return buffer;
};
Selafin.prototype.getFrames = function getFrames (){
  var uint8array =this.uint8array;
  var endian = this.file.endian;    
  var ref = this.file.float;
    var ftype = ref[0];
    var fsize = ref[1];
  var frames = this.FRAMES = new Float32Array(this.NFRAME * this.NVAR * this.NPOIN3);
  for(var t=0;t<this.NFRAME;t++){
    var pos=this.tags['cores'][t];
    pos +=4+fsize+4;
    for(var ivar=0;ivar<this.NVAR;ivar++){
      pos +=4;
      frames.set(bufferpack.unpack(endian+(this.NPOIN3)+ftype,uint8array,pos),(t * this.NVAR * this.NPOIN3)+ivar*this.NPOIN3);
      pos +=fsize*this.NPOIN3;
      pos +=4;
    }
  }
};
   
Selafin.prototype.getFrame = function getFrame (t,v){ 
  if(!this.FRAMES){
    console.warn("this.FRAMES is null. Add keepframes=true in options"); 
    return null;
  } 
  t = (typeof t !== 'undefined') ?t : 0;
  v = (typeof v !== 'undefined') ?v : 0;
  if (!(t >= 0 && t < this.NFRAME)) { throw Error("Check frame({0}) id={1} ".format(this.NFRAME,t)); } 
  if (!(v >= 0 && v < this.NVAR)) { throw Error("Check variable id"); }
    
  return this.FRAMES.subarray((t * this.NVAR * this.NPOIN3)+(v * this.NPOIN3),(t * this.NVAR * this.NPOIN3)+(v * this.NPOIN3)+this.NPOIN3);
};


Selafin.prototype.getMinMax = function getMinMax (){
  var minmax = new Float32Array(this.NVAR * 2);
  for(var ivar=0;ivar<this.NVAR;ivar++){
    var max = Number.MIN_VALUE;
    var min = Number.MAX_VALUE;
    for(var i=0;i<this.NFRAME;i++){
      var values = this.getFrame(i);
      min = Math.min(min,values.min());
      max = Math.max(max,values.max());
    }
    minmax[ivar*2] = min;
    minmax[ivar*2+1] = max;
  }
  return minmax;
};
Selafin.prototype.getVarMinMax = function getVarMinMax (ivar){
  return this.minmax.subarray(ivar*2,ivar*2+1);
};
Selafin.prototype.getElements = function getElements (indices){
  if(!indices){ return this.IKLE3F; }
  if(!Number.isInteger(indices) && !Array.isArray(indices)){ return this.IKLE3F; }
  indices = (Number.isInteger(indices)) ? [indices]:indices;
    
  // ~~> get element
  if (this.debug) { console.time('Get elements'); }    
  var elements = new Uint32Array(indices.length*this.NDP3);
  for(var i=0,j=0,n=indices.length;i<n;i++,j+=3){
    elements[j+0] = this.IKLE3F[indices[i]];
    elements[j+1] = this.IKLE3F[indices[i]+1];
    elements[j+2] = this.IKLE3F[indices[i]+2];
  }
  if (this.debug) { console.timeEnd('Get elements'); }    
  return elements;
};
Selafin.prototype.getElementsW = function getElementsW (indices){
  if(!indices){ return this.IKLE3F; }
  if(!Number.isInteger(indices) && !Array.isArray(indices)){ return this.IKLE3F; }
  indices = (Number.isInteger(indices)) ? [indices]:indices;
    
  // ~~> get element
  if (this.debug) { console.time('Get elementsW'); }    
  var elements = new Uint32Array(indices.length*this.NDP3*2);
  for(var i=0,j=0,k=0,n=indices.length;i<n;i++,j+=6,k+3){
    elements[j+0] = this.IKLE3F[indices[i]];
    elements[j+1] = this.IKLE3F[indices[i]+1];
    elements[j+2] = this.IKLE3F[indices[i]+1];
    elements[j+3] = this.IKLE3F[indices[i]+2];
    elements[j+4] = this.IKLE3F[indices[i]+2];
    elements[j+5] = this.IKLE3F[indices[i]];
  }
  if (this.debug) { console.timeEnd('Get elementsW'); }    
  return elements;
};
Selafin.prototype.reshapeIKLE = function reshapeIKLE (){
  var newIKLE = new Uint32Array(this.NELEM3*this.NDP3);
  for(var i=0,j=0;i<this.NELEM3;i++,j+=3){
    newIKLE[i] =this.IKLE3[j];
    newIKLE[i+this.NELEM3] = this.IKLE3[j+1];
    newIKLE[i+2*this.NELEM3] = this.IKLE3[j+2];
  }
  return newIKLE;
};
Selafin.prototype.changeProj = function changeProj (from,to){
  this.fromProj = from;
  this.toProj = to;
  if(from !== to){
    this.initializeProperties();
    this.transform();
  }
};
Selafin.prototype.transform = function transform (){
  var fromProj = this.fromProj;
  var toProj = this.toProj;
  if(fromProj !== toProj){
    var transform = proj4(fromProj,toProj);
    var coord;
    for(var i=0;i<this.NPOIN3;i++){
      coord=transform.forward([this.MESHX[i],this.MESHY[i]]);
      this.MESHX[i] = coord[0];
      this.MESHY[i] = coord[1];
    }
    this.fromProj = toProj;
  }
};
prototypeAccessors.TRIXY.get = function (){
  if (!(this._TRIXY)) { this.getTriXY(); }
  return this._TRIXY;
};
prototypeAccessors.varnames.get = function (){
 return this.VARNAMES.map(function (name){ return name.replace(/\s/g, '').toLowerCase(); });
};  
Selafin.prototype.getVarIndex = function getVarIndex (id){return this.varnames.findIndex(function (name){ return name==id; })};


prototypeAccessors.XY.get = function (){
  if (!(this._XY)) { this.getXY(); }
  return this._XY;
};
prototypeAccessors.IKLEW.get = function (){
  if (!(this._IKLEW)) { this.getIKLEW(); }
  return this._IKLEW;
};
prototypeAccessors.EDGES.get = function (){
  if (!(this._EDGES)) { this.getEDGES(); }
  return this._EDGES;
};
prototypeAccessors.BEDGES.get = function (){
  if (!(this._BEDGES)) { this.getBEDGES(); }
  return this._BEDGES;
};
prototypeAccessors.IEDGES.get = function (){
  if (!(this._IEDGES)) { this.getIEDGES(); }
  return this._IEDGES;
};
  
prototypeAccessors.CX.get = function (){
  if(!(this._CX)) { this.getTriAttributes(); }
  return this._CX;
};
prototypeAccessors.CY.get = function (){
  if (!(this._CY)) { this.getTriAttributes(); }
  return this._CY;
};
prototypeAccessors.TRIAREA.get = function (){
  if (!(this._TRIAREA)) { this.getTriAttributes(); }
  return this._TRIAREA;
};
prototypeAccessors.TRIBBOX.get = function (){
  if (!(this._TRIBBOX)) { this.getTriAttributes(); }
  return this._TRIBBOX;
};
  

prototypeAccessors.BBOX.get = function (){return this.EXTENT};
prototypeAccessors.EXTENT.get = function (){
  if (!(this._EXTENT)){ this.getExtent(); }
  return this._EXTENT;
};
prototypeAccessors.POLYGON.get = function (){
if (!(this._POLYGON)){ this.getPolygon(); }
    return this._POLYGON;
};
prototypeAccessors.EXTERIOR.get = function (){
  if (!(this._EXTERIOR)){ this.getExterior(); }
  return this._EXTERIOR;
};
prototypeAccessors.INTERIORS.get = function (){
  if (!(this._INTERIORS)){ this.getExterior(); }
  return this._INTERIORS;
};  
prototypeAccessors.POLYGONS.get = function (){ 
  if (!(this._POLYGONS)){ this.getPolygons(); }
  return this._POLYGONS;
};

  
Selafin.prototype.getExtent = function getExtent (){
  if (this.debug) { console.time('Get extent'); }
  this._EXTENT=new Float32Array([this.MESHX.min(),this.MESHY.min(),this.MESHX.max(),this.MESHY.max()]);
  if (this.debug) { console.timeEnd('Get extent'); }
};
Selafin.prototype.getExterior = function getExterior (){
  if (this.debug) { console.time('Get exterior/interiors'); }
  var polygons = this.POLYGONS;
  var areas = polygons.map(function (pol){ return area(pol); });
  var interiors = this._INTERIORS = areas.sortIndices(true).map(function (i){ return polygons[i]; });
  this._EXTERIOR= interiors.shift();
  if (this.debug) { console.timeEnd('Get exterior/interiors'); }
};
Selafin.prototype.getCoordinate = function getCoordinate (i){return [this.MESHX[i],this.MESHY[i]]};
Selafin.prototype.getPolygon = function getPolygon (){
  if (this.debug) { console.time('Get polygon'); }
  if(this.INTERIORS.length==0){this._POLYGON =this.EXTERIOR;}
  else{this._POLYGON = mask(helpers.featureCollection(this.INTERIORS),this.EXTERIOR);}
  if (this.debug) { console.timeEnd('Get polygon'); }
};
Selafin.prototype.getPolygons = function getPolygons (){
  if (this.debug) { console.time('Get polygons'); }
  var bedges=this.BEDGES;
  var pols =this._POLYGONS= [];
  var index,start,end=-1,pol=[];
  while(bedges.length>0){
    index=bedges.findIndex(function (item){ return item.start==end || item.end==end; });
    if(index==-1){
      if(pol.length>0){pols.push(helpers.polygon([pol]));pol=[];}
      start=bedges[0].start;
      end=bedges[0].end;
      pol.push(this.getCoordinate(start));
      pol.push(this.getCoordinate(end));
      bedges.splice(0,1);
    } else {
      end=(bedges[index].start==end)?bedges[index].end:bedges[index].start;
      pol.push(this.getCoordinate(end));
      bedges.splice(index,1);
      if(bedges.length==0 && pol.length>0){ pols.push(helpers.polygon([pol])); }
    }
  }
  if (this.debug) { console.timeEnd('Get polygons'); }
};
  
Selafin.prototype.getIKLEW = function getIKLEW (){
  if (this.debug) { console.time('Get connectivity for wireframe'); }
  var IKLEW = this._IKLEW = new Uint32Array(this.NELEM3*this.NDP3*2);
  for(var i=0,j=0,k=0;i<this.NELEM3;i++,j+=6,k+=3){
    IKLEW[j] =this.IKLE3F[k];
    IKLEW[j+1] = this.IKLE3F[k+1];
    IKLEW[j+2] = this.IKLE3F[k+1];
    IKLEW[j+3] = this.IKLE3F[k+2];
    IKLEW[j+4] = this.IKLE3F[k+2];
    IKLEW[j+5] = this.IKLE3F[k];
  }
  if (this.debug) { console.timeEnd('Get connectivity for wireframe'); }
};
Selafin.prototype.getTriXY = function getTriXY (){
  // ~~> get element xy
  if (this.debug) { console.time('Get element xy'); }
  var exy = this._TRIXY = new Float32Array(this.NELEM3*this.NDP3*3);
  var n1,n2,n3;
  for(var i=0,j=0,n=this.NELEM3;i<n;i++,j+=9){
    n1 = this.IKLE3[i];
    n2 = this.IKLE3[i+this.NELEM3];
    n3 = this.IKLE3[i+2*this.NELEM3];
    exy[j] = this.MESHX[n1];
    exy[j+1] = this.MESHY[n1];
    // z = 0.
    exy[j+3] = this.MESHX[n2];
    exy[j+4] = this.MESHY[n2];
    // z = 0.
    exy[j+6] = this.MESHX[n3];
    exy[j+7] = this.MESHY[n3];
    // z = 0.
  }
  if (this.debug) { console.timeEnd('Get element xy'); }
};
Selafin.prototype.getXY = function getXY (){
    
  // ~~> get points
  if (this.debug) { console.time('Get points xy'); }
  var xy = this._XY = new Float32Array(this.NPOIN3*3);
  for(var i=0,j=0,n=this.NPOIN3;i<n;i++,j+=3){
    xy[j] = this.MESHX[i];
    xy[j+1] = this.MESHY[i];
  }
  if (this.debug) { console.timeEnd('Get points xy'); }
};
Selafin.prototype.getBEDGES = function getBEDGES (){
  if (this.debug) { console.time('Get bedges'); }
  var edges = this.EDGES;
  var bedges = this._BEDGES = Object.keys(edges).filter(function (key){ return !edges[key].boundary; }).map(function (key){ return edges[key]; });
  if (this.debug) { console.timeEnd('Get bedges'); }
};
Selafin.prototype.getIEDGES = function getIEDGES (){
  if (this.debug) { console.time('Get iedges'); }
  var edges = this.EDGES;
 var iedges = this._IEDGES = Object.keys(edges).filter(function (key){ return edges[key].boundary; }).map(function (key){ return edges[key]; });
  if (this.debug) { console.timeEnd('Get iedges'); }
};  
Selafin.prototype.getEDGES = function getEDGES (){
  if (this.debug) { console.time('Get edges'); }
  var edges = this._EDGES = {};
  var n1,n2,n3,_n1,_n2,_n3;
  for (vare = 0; e < this.NELEM3; e++ )
  {
    n1 = this.IKLE3[e];
    n2 = this.IKLE3[e+this.NELEM3];
    n3 = this.IKLE3[e+2*this.NELEM3];
      
    _n1 = '{0}-{1}'.format(Math.min(n1,n2),Math.max(n1,n2));
    _n2 = '{0}-{1}'.format(Math.min(n2,n3),Math.max(n2,n3));
    _n3 = '{0}-{1}'.format(Math.min(n3,n1),Math.max(n3,n1));
    (typeof edges[_n1]!=='undefined')?edges[_n1].boundary=true:edges[_n1]={boundary:false,start:Math.min(n1,n2),end:Math.max(n1,n2)}; 
    (typeof edges[_n2]!=='undefined')?edges[_n2].boundary=true:edges[_n2]={boundary:false,start:Math.min(n2,n3),end:Math.max(n2,n3)};
    (typeof edges[_n3]!=='undefined')?edges[_n3].boundary=true:edges[_n3]={boundary:false,start:Math.min(n3,n1),end:Math.max(n3,n1)};
  }
  if (this.debug) { console.timeEnd('Get edges'); }
};

Selafin.prototype.getTriAttributes = function getTriAttributes (){
  if (this.debug) { console.time('Get element attributes'); }
  // Centroid is computed using mean of X and Y
  // Area is computed using cross-product
  var CX = this._CX = new Float32Array(this.NELEM3);
  var CY = this._CY = new Float32Array(this.NELEM3);    
  var area$$1 = this._TRIAREA = new Float32Array(this.NELEM3);
  var bbox = this._TRIBBOX = new Array(this.NELEM3);
  var n1,n2,n3;
  for(var i=0,n=this.NELEM3;i<n;i++){
    n1 = this.IKLE3[i];
    n2 = this.IKLE3[i+this.NELEM3];
    n3 = this.IKLE3[i+2*this.NELEM3];
      
    CX[i] = (this.MESHX[n1] + this.MESHX[n2] + this.MESHX[n3]) / 3.0;
    CY[i] = (this.MESHY[n1] + this.MESHY[n2] + this.MESHY[n3]) / 3.0;      
    bbox[i] = {
      minX:Math.min(this.MESHX[n1],Math.min(this.MESHX[n2],this.MESHX[n3])),
      minY:Math.min(this.MESHY[n1],Math.min(this.MESHY[n2],this.MESHY[n3])),
      maxX:Math.max(this.MESHX[n1],Math.max(this.MESHX[n2],this.MESHX[n3])),
      maxY:Math.max(this.MESHY[n1],Math.max(this.MESHY[n2],this.MESHY[n3])),
      index:i
      };
    // TODO : Assume cartesian coordinate system. 
    //      If using lat/long, areas might be misleading for large elements (several kilometers).
    //      I'm not sure if there's an easy solution. I've seen ajustment for different latitudes (mourne wind map)
    area$$1[i] = Math.abs(0.5 * ((this.MESHX[n2] - this.MESHX[n1]) * (this.MESHY[n3] - this.MESHY[n1]) - 
                     (this.MESHX[n3] - this.MESHX[n1]) * (this.MESHY[n2] - this.MESHY[n1])
                    ));
  }
  if (this.debug) { console.timeEnd('Get element attributes'); }
};
  
//{STRING} title  
Selafin.prototype.addTITLE = function addTITLE (title){
  this.TITLE = '{0}'.format(title.rpad(" ", 80));
};

//{OBJECT (name:str,unit:str)}
Selafin.prototype.addVAR = function addVAR (obj){
  if(!obj){ obj={}; }
  var name = obj.name || 'NewVariable';
  var unit = obj.unit || 'NewUnit';
  this.NBV1 += 1;
  this.NVAR = this.NBV1 + this.NBV2;
  this.VARINDEX = util.range(this.NVAR);
  this.VARNAMES.push('{0}'.format(name.rpad(" ", 16))); 
  this.VARUNITS.push('{0}'.format(unit.rpad(" ", 16))); 
};
  
   
Selafin.prototype.addPOINTS = function addPOINTS (x,y){
  if(!x) { throw new Error("Requires points") }
  this.IPOB3 = new Uint32Array(x.length).range();
  this.IPOB2 = this.IPOB3;
  this.IPARAM = new Uint8Array(10);
  this.IPARAM[0] = 1;
  this.NPOIN2 = x.length;
  this.NPOIN3 =this.NPOIN2;
  (y)?this._addXY(x,y):this._addPoints(x);
 };
 Selafin.prototype._addXY = function _addXY (x,y){
   this.MESHX=x;
   this.MESHY=y;
 };
 Selafin.prototype._addPoints = function _addPoints (points){
  this.MESHX = new Float32Array(this.NPOIN3);
  this.MESHY = new Float32Array(this.NPOIN3);
    
  for(var i=0;i<this.NPOIN3;i++){
    this.MESHX[i]=points[i].x;
    this.MESHY[i]=points[i].y;
  }
 };
   
//Uint32Array(NELEM3*NDP3)
Selafin.prototype.addIKLE = function addIKLE (ikle){
  this.NDP2 = 3;
  this.NDP3 = 3;
  this.NELEM3 = ikle.length / this.NDP3;
  this.NELEM2 = this.NELEM3;
  this.IKLE2 = ikle;
  this.IKLE3 = ikle; 
    
  this.IKLE3F = this.IKLE3;
  this.IKLE3 = this.reshapeIKLE();
};
Selafin.prototype.addFrame = function addFrame (array){
  if(array.length !=this.NVAR * this.NPOIN3){ throw new Error("Wrong array size"); }
  this.NFRAME +=1;
  if(!this.FRAMES){ return this.FRAMES=array; }
  var oldFrames = this.FRAMES;
  this.FRAMES = new Float32Array(this.NFRAME * this.NVAR * this.NPOIN3);
  this.FRAMES.set(oldFrames,0);
  this.FRAMES.set(array,(this.NFRAME-1) * this.NVAR * this.NPOIN3);
};  
// {STRING} title
// {OBJECT (name:str,unit:str)} var
// {2D Array}
// {2D Array(NELEM,3}
Selafin.prototype.addMesh = function addMesh (title,variable,points,ikle){
    this.empty = false;
    this.addTITLE(title);
    this.addVAR(variable);
    this.addPOINTS(points);
    this.addIKLE(ikle);
};
// {String}
// writeSLF(self,output){
// // this.appendHeaderSLF()
// // // ~~> Time stepping
// // self.tags['times']=np.arange(self.values.shape[0])
// // for t in range(self.NFRAME):
// //   self.appendCoreTimeSLF(t)
// //   self.appendCoreVarsSLF(self.values[t])
// // self.fole['hook'].close()  
// }
Selafin.prototype.printAttributes = function printAttributes (){
  var attr = {
    'NFRAME':this.NFRAME,
    'NVAR':this.NVAR,
    'NPOIN3':this.NPOIN3,
    'NELEM3':this.NELEM3,
    'EXTENT':this.EXTENT,
  };
  console.log(attr);
};

Object.defineProperties( Selafin.prototype, prototypeAccessors );

var SelafinGL = /*@__PURE__*/(function (Selafin$$1) {
  function SelafinGL(buffer,options){
   Selafin$$1.call(this, buffer,options);
  }

  if ( Selafin$$1 ) SelafinGL.__proto__ = Selafin$$1;
  SelafinGL.prototype = Object.create( Selafin$$1 && Selafin$$1.prototype );
  SelafinGL.prototype.constructor = SelafinGL;

  var prototypeAccessors = { position: { configurable: true },indices: { configurable: true },indicesW: { configurable: true } };
  prototypeAccessors.position.get = function (){return this.XY};
  prototypeAccessors.indices.get = function (){return this.IKLE3F};
  prototypeAccessors.indicesW.get = function (){return this.IKLE3W};

  Object.defineProperties( SelafinGL.prototype, prototypeAccessors );

  return SelafinGL;
}(Selafin));

var SelafinMP = /*@__PURE__*/(function (Selafin$$1) {
  function SelafinMP(buffer,options){
    options.toProj = 'EPSG:3857';
    Selafin$$1.call(this, buffer,options);
    this.tileLimits = options.tileLimits || {min_zoom: 1,max_zoom: 12};
    this.eLimit = options.eLimit || 50000;
    this.quadkey = '';
  }

  if ( Selafin$$1 ) SelafinMP.__proto__ = Selafin$$1;
  SelafinMP.prototype = Object.create( Selafin$$1 && Selafin$$1.prototype );
  SelafinMP.prototype.constructor = SelafinMP;

  var prototypeAccessors = { position: { configurable: true },indices: { configurable: true },indicesW: { configurable: true },TILES: { configurable: true },KDTREE: { configurable: true } };
  SelafinMP.prototype.setQuadkey = function setQuadkey (quadkey){this.quadkey=quadkey;this._indices=null;this._indicesW=null;};
  prototypeAccessors.position.get = function (){return this.XY};
  prototypeAccessors.indices.get = function () {if(!this._indices){ this.getIndices(); }return this._indices;};
  prototypeAccessors.indicesW.get = function (){if(!this._indices){ this.getIndices(); }return this._indicesW;};  
  
  prototypeAccessors.TILES.get = function (){
    if (!(this._TILES)) { this.getTiles(); }
    return this._TILES;
  };    
  prototypeAccessors.KDTREE.get = function (){
    if (!(this._KDTREE)){ this.getKDTree(); }
    return this._KDTREE;    
  };
  SelafinMP.prototype.getIndices = function getIndices (){
    var indices = this.TILES[this.quadkey];
    if(!indices){ return null; }
    if(typeof indices==='string'){ indices=this.TILES[indices]; }
    this._indices = this.getElements(indices);
    this._indicesW = this.getElementsW(indices);
  };
  SelafinMP.prototype.getKDTree = function getKDTree (){
    if (this.debug) { console.time('Get kdtree'); }
    var tree = this._KDTREE = rbush();
    tree.load(this.TRIBBOX);
    if (this.debug) { console.timeEnd('Get kdtree'); }
  };
  SelafinMP.prototype.getTiles = function getTiles (){
    var this$1 = this;

    if (this.debug) { console.time('Get tiles'); }
    var eLimit = this.eLimit;
    var ref = this.tileLimits;
    var min_zoom = ref.min_zoom;
    var max_zoom = ref.max_zoom;
    var zooms = util.range(max_zoom-min_zoom).add(min_zoom); //TODO:change range in @julien.cousineau/util
    // const geometry = this.POLYGON.geometry;
    var geometry = bboxPolygon(this.EXTENT).geometry;
    var tiles =this._TILES= {};
    zooms.forEach(function (zoom){
      // if (this.debug) console.time(zoom);
      var quads = cover.indexes(geometry, {min_zoom:zoom,max_zoom:zoom});
      quads.forEach(function (quad){
        if(!quad){ return; }
        var tile = tilebelt.quadkeyToTile(quad);
        var parentquad = tilebelt.tileToQuadkey(tilebelt.getParent(tile));
        
        if(tiles[parentquad] && !Array.isArray(tiles[parentquad])){tiles[quad]=tiles[parentquad];
        } else if(tiles[parentquad] && Array.isArray(tiles[parentquad]) && tiles[parentquad].length<eLimit){tiles[quad]=parentquad;
        } else {
          var bbox = tilebelt.tileToBBOX(tile);
          var elements = this$1.KDTREE.search({minX: bbox[0],minY: bbox[1],maxX: bbox[2],maxY: bbox[3]});
          var indices = elements.filter(function (e){ return this$1.intersect(e.index,bbox); }).map(function (e){ return e.index; });
          if(indices.length==0){ return tiles[quad]=parentquad; }
          if(indices < eLimit){ return tiles[quad]=indices; }
          var sorted = indices.map(function (e){ return [e,this$1.TRIAREA[e]]; }).sort(function (a,b){ return b[1]-a[1]; }).map(function (item){ return item[0]; });
          tiles[quad]=sorted.slice(0,eLimit);
          
        }
      });
    });
    if (this.debug) { console.timeEnd('Get tiles'); }
  };
  SelafinMP.prototype.getTile = function getTile (quadkey){
    return this.TILES[quadkey];
  };
  SelafinMP.prototype.intersect = function intersect (e,bbox){
    var n1 = this.IKLE3[e];
    var n2 = this.IKLE3[e+this.NELEM3];
    var n3 = this.IKLE3[e+2*this.NELEM3];
    var t_p1 = [this.MESHX[n1],this.MESHY[n1]];
    var t_p2 = [this.MESHX[n2],this.MESHY[n2]];
    var t_p3 = [this.MESHX[n3],this.MESHY[n3]];
    if(inBBox(t_p1,bbox)){ return true; }
    if(inBBox(t_p2,bbox)){ return true; }
    if(inBBox(t_p3,bbox)){ return true; }
    
    var q_p1 = [bbox[0],bbox[1]];
    var q_p2 = [bbox[0],bbox[3]];
    var q_p3 = [bbox[2],bbox[3]];
    var q_p4 = [bbox[2],bbox[1]];
    
    var tri1 = [t_p1,t_p2];
    var tri2 = [t_p2,t_p3];
    var tri3 = [t_p3,t_p1];
  
    var quad1 = [q_p1,q_p2];
    var quad2 = [q_p2,q_p3];
    var quad3 = [q_p3,q_p4];
    var quad4 = [q_p4,q_p1];
    
    if(boolIntersects(tri1,quad1)){ return true; }
    if(boolIntersects(tri1,quad2)){ return true; }
    if(boolIntersects(tri1,quad3)){ return true; }
    if(boolIntersects(tri1,quad4)){ return true; }
    
    if(boolIntersects(tri2,quad1)){ return true; }
    if(boolIntersects(tri2,quad2)){ return true; }
    if(boolIntersects(tri2,quad3)){ return true; }
    if(boolIntersects(tri2,quad4)){ return true; }
    
    if(boolIntersects(tri3,quad1)){ return true; }
    if(boolIntersects(tri3,quad2)){ return true; }
    if(boolIntersects(tri3,quad3)){ return true; }
    if(boolIntersects(tri3,quad4)){ return true; }
  };

  Object.defineProperties( SelafinMP.prototype, prototypeAccessors );

  return SelafinMP;
}(Selafin));

// https://github.com/Turfjs/turf/blob/master/packages/turf-line-intersect/index.ts
function boolIntersects(coords1,coords2) {
    
  
    // if (coords1.length !== 2)throw new Error("<intersects> line1 must only contain 2 coordinates");
    // if (coords2.length !== 2)throw new Error("<intersects> line2 must only contain 2 coordinates");
    var x1 = coords1[0][0];
    var y1 = coords1[0][1];
    var x2 = coords1[1][0];
    var y2 = coords1[1][1];
    var x3 = coords2[0][0];
    var y3 = coords2[0][1];
    var x4 = coords2[1][0];
    var y4 = coords2[1][1];
    var denom = ((y4 - y3) * (x2 - x1)) - ((x4 - x3) * (y2 - y1));
    var numeA = ((x4 - x3) * (y1 - y3)) - ((y4 - y3) * (x1 - x3));
    var numeB = ((x2 - x1) * (y1 - y3)) - ((y2 - y1) * (x1 - x3));

    if (denom === 0) { return null; }
    
    var uA = numeA / denom;
    var uB = numeB / denom;

    if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1){ return true; }
    return null;
}
function inBBox(pt, bbox) {
    return bbox[0] <= pt[0] &&
        bbox[1] <= pt[1] &&
        bbox[2] >= pt[0] &&
        bbox[3] >= pt[1];
}

exports.Selafin = Selafin;
exports.SelafinGL = SelafinGL;
exports.SelafinMP = SelafinMP;

Object.defineProperty(exports, '__esModule', { value: true });

})));
