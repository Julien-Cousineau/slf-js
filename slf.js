(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
typeof define === 'function' && define.amd ? define(factory) :
(global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.slf = factory());
})(this, (function () { 'use strict';

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

[Array,Int8Array,Int16Array, Int32Array,Uint8Array,Uint16Array, Uint32Array,Float32Array].forEach(function (item){
    if (!item.prototype.range) {
        item.prototype.range = function() {
            for(var i=0;i<this.length;i++){ this[i]=i; }
            return this;
        };
    }
    if (!item.prototype.random) {
        item.prototype.random = function() {
            for(var i=0;i<this.length;i++){ this[i]=parseInt(Math.random()*(this.length-1)); }
            return this;
        };
    }    
    
    if (!item.prototype.clamp) {
        item.prototype.clamp = function(min, max) {
            for(var i=0;i<this.length;i++){ this[i]=i.clamp(min,max); }
            return this;
        };
    }

    if (!item.prototype.min) {
        item.prototype.min = function(){
            var min = +Infinity,len = this.length;
            for (var i=0 ; i < len; i++ )
                { if ( this[i] < min ) { min = this[i]; } }
            return min;
        };
    }    
    
    
    if (!item.prototype.max) {
        item.prototype.max = function(){
            var max = -Infinity, len = this.length;
            for (var i=0 ; i < len; i++ )
                { if ( this[i] > max ) { max = this[i]; } }
            return max;
        };
    }   
    
    if (!item.prototype.add) {
        item.prototype.add = function(value){
            for(var i=0,n=this.length;i<n;i++){ this[i]+=value; }
            return this;
        };
    }
    if (!item.prototype.subtract) {
        item.prototype.subtract = function(value){
            for(var i=0,n=this.length;i<n;i++){ this[i]-=value; }
            return this;
        };
    }
    if (!item.prototype.multiply) {
        item.prototype.multiply = function(value){
            for(var i=0,n=this.length;i<n;i++){ this[i]*=value; }
            return this;
        };
    }
    
    if (!item.prototype.divide) {
        item.prototype.divide = function(value){
            for(var i=0,n=this.length;i<n;i++){ this[i]/=value; }
            return this;
        };
    }        
    
    if (!item.prototype.compare) {
        item.prototype.compare = function( a ) {
            var epsilon = 1.0E-7;
            for (var i = 0, n = this.length; i<n; i++) {
                if (a[i] - this[i] > epsilon) { return false; }
            }
            return true;
        };        
    }
});
  
var range=function (n,type){
    n = (typeof n !== 'undefined') ?  n : 0;
    if (!(Number.isInteger(n))) { throw Error("Error in range: Value must be an integer"); }
    var array;
    
    if(type=='Uint8')  { array = new Uint8Array(n); }
    if(type=='Uint16') { array = new Uint16Array(n); }
    if(type=='Uint32') { array = new Uint32Array(n); }
    if(type=='Int8')  { array = new Int8Array(n); }
    if(type=='Int16') { array = new Int16Array(n); }
    if(type=='Int32') { array = new Int32Array(n); }
    if(type=='Float32')  { array = new Float32Array(n); }
    if((typeof type === 'undefined') || !array){ array = new Array(n); }
    
    for(var i=0;i<n;i++){ array[i]=i; }
    return array;
};

/**
 * @module helpers
 */
/**
 * Wraps a GeoJSON {@link Geometry} in a GeoJSON {@link Feature}.
 *
 * @name feature
 * @param {Geometry} geometry input geometry
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature} a GeoJSON Feature
 * @example
 * var geometry = {
 *   "type": "Point",
 *   "coordinates": [110, 50]
 * };
 *
 * var feature = turf.feature(geometry);
 *
 * //=feature
 */
function feature(geom, properties, options) {
    if (options === void 0) { options = {}; }
    var feat = { type: "Feature" };
    if (options.id === 0 || options.id) {
        feat.id = options.id;
    }
    if (options.bbox) {
        feat.bbox = options.bbox;
    }
    feat.properties = properties || {};
    feat.geometry = geom;
    return feat;
}
/**
 * Creates a {@link Polygon} {@link Feature} from an Array of LinearRings.
 *
 * @name polygon
 * @param {Array<Array<Array<number>>>} coordinates an array of LinearRings
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<Polygon>} Polygon Feature
 * @example
 * var polygon = turf.polygon([[[-5, 52], [-4, 56], [-2, 51], [-7, 54], [-5, 52]]], { name: 'poly1' });
 *
 * //=polygon
 */
function polygon(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    for (var _i = 0, coordinates_1 = coordinates; _i < coordinates_1.length; _i++) {
        var ring = coordinates_1[_i];
        if (ring.length < 4) {
            throw new Error("Each LinearRing of a Polygon must have 4 or more Positions.");
        }
        for (var j = 0; j < ring[ring.length - 1].length; j++) {
            // Check if first point of Polygon contains two numbers
            if (ring[ring.length - 1][j] !== ring[0][j]) {
                throw new Error("First and last Position are not equivalent.");
            }
        }
    }
    var geom = {
        type: "Polygon",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
/**
 * Takes one or more {@link Feature|Features} and creates a {@link FeatureCollection}.
 *
 * @name featureCollection
 * @param {Feature[]} features input features
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {FeatureCollection} FeatureCollection of Features
 * @example
 * var locationA = turf.point([-75.343, 39.984], {name: 'Location A'});
 * var locationB = turf.point([-75.833, 39.284], {name: 'Location B'});
 * var locationC = turf.point([-75.534, 39.123], {name: 'Location C'});
 *
 * var collection = turf.featureCollection([
 *   locationA,
 *   locationB,
 *   locationC
 * ]);
 *
 * //=collection
 */
function featureCollection(features, options) {
    if (options === void 0) { options = {}; }
    var fc = { type: "FeatureCollection" };
    if (options.id) {
        fc.id = options.id;
    }
    if (options.bbox) {
        fc.bbox = options.bbox;
    }
    fc.features = features;
    return fc;
}
/**
 * Creates a {@link Feature<MultiPolygon>} based on a
 * coordinate array. Properties can be added optionally.
 *
 * @name multiPolygon
 * @param {Array<Array<Array<Array<number>>>>} coordinates an array of Polygons
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<MultiPolygon>} a multipolygon feature
 * @throws {Error} if no coordinates are passed
 * @example
 * var multiPoly = turf.multiPolygon([[[[0,0],[0,10],[10,10],[10,0],[0,0]]]]);
 *
 * //=multiPoly
 *
 */
function multiPolygon(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    var geom = {
        type: "MultiPolygon",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}

/**
 * Callback for geomEach
 *
 * @callback geomEachCallback
 * @param {Geometry} currentGeometry The current Geometry being processed.
 * @param {number} featureIndex The current index of the Feature being processed.
 * @param {Object} featureProperties The current Feature Properties being processed.
 * @param {Array<number>} featureBBox The current Feature BBox being processed.
 * @param {number|string} featureId The current Feature Id being processed.
 */

/**
 * Iterate over each geometry in any GeoJSON object, similar to Array.forEach()
 *
 * @name geomEach
 * @param {FeatureCollection|Feature|Geometry} geojson any GeoJSON object
 * @param {Function} callback a method that takes (currentGeometry, featureIndex, featureProperties, featureBBox, featureId)
 * @returns {void}
 * @example
 * var features = turf.featureCollection([
 *     turf.point([26, 37], {foo: 'bar'}),
 *     turf.point([36, 53], {hello: 'world'})
 * ]);
 *
 * turf.geomEach(features, function (currentGeometry, featureIndex, featureProperties, featureBBox, featureId) {
 *   //=currentGeometry
 *   //=featureIndex
 *   //=featureProperties
 *   //=featureBBox
 *   //=featureId
 * });
 */
function geomEach(geojson, callback) {
  var i,
    j,
    g,
    geometry,
    stopG,
    geometryMaybeCollection,
    isGeometryCollection,
    featureProperties,
    featureBBox,
    featureId,
    featureIndex = 0,
    isFeatureCollection = geojson.type === "FeatureCollection",
    isFeature = geojson.type === "Feature",
    stop = isFeatureCollection ? geojson.features.length : 1;

  // This logic may look a little weird. The reason why it is that way
  // is because it's trying to be fast. GeoJSON supports multiple kinds
  // of objects at its root: FeatureCollection, Features, Geometries.
  // This function has the responsibility of handling all of them, and that
  // means that some of the `for` loops you see below actually just don't apply
  // to certain inputs. For instance, if you give this just a
  // Point geometry, then both loops are short-circuited and all we do
  // is gradually rename the input until it's called 'geometry'.
  //
  // This also aims to allocate as few resources as possible: just a
  // few numbers and booleans, rather than any temporary arrays as would
  // be required with the normalization approach.
  for (i = 0; i < stop; i++) {
    geometryMaybeCollection = isFeatureCollection
      ? geojson.features[i].geometry
      : isFeature
      ? geojson.geometry
      : geojson;
    featureProperties = isFeatureCollection
      ? geojson.features[i].properties
      : isFeature
      ? geojson.properties
      : {};
    featureBBox = isFeatureCollection
      ? geojson.features[i].bbox
      : isFeature
      ? geojson.bbox
      : undefined;
    featureId = isFeatureCollection
      ? geojson.features[i].id
      : isFeature
      ? geojson.id
      : undefined;
    isGeometryCollection = geometryMaybeCollection
      ? geometryMaybeCollection.type === "GeometryCollection"
      : false;
    stopG = isGeometryCollection
      ? geometryMaybeCollection.geometries.length
      : 1;

    for (g = 0; g < stopG; g++) {
      geometry = isGeometryCollection
        ? geometryMaybeCollection.geometries[g]
        : geometryMaybeCollection;

      // Handle null Geometry
      if (geometry === null) {
        if (
          callback(
            null,
            featureIndex,
            featureProperties,
            featureBBox,
            featureId
          ) === false
        )
          { return false; }
        continue;
      }
      switch (geometry.type) {
        case "Point":
        case "LineString":
        case "MultiPoint":
        case "Polygon":
        case "MultiLineString":
        case "MultiPolygon": {
          if (
            callback(
              geometry,
              featureIndex,
              featureProperties,
              featureBBox,
              featureId
            ) === false
          )
            { return false; }
          break;
        }
        case "GeometryCollection": {
          for (j = 0; j < geometry.geometries.length; j++) {
            if (
              callback(
                geometry.geometries[j],
                featureIndex,
                featureProperties,
                featureBBox,
                featureId
              ) === false
            )
              { return false; }
          }
          break;
        }
        default:
          throw new Error("Unknown Geometry Type");
      }
    }
    // Only increase `featureIndex` per each feature
    featureIndex++;
  }
}

/**
 * Callback for geomReduce
 *
 * The first time the callback function is called, the values provided as arguments depend
 * on whether the reduce method has an initialValue argument.
 *
 * If an initialValue is provided to the reduce method:
 *  - The previousValue argument is initialValue.
 *  - The currentValue argument is the value of the first element present in the array.
 *
 * If an initialValue is not provided:
 *  - The previousValue argument is the value of the first element present in the array.
 *  - The currentValue argument is the value of the second element present in the array.
 *
 * @callback geomReduceCallback
 * @param {*} previousValue The accumulated value previously returned in the last invocation
 * of the callback, or initialValue, if supplied.
 * @param {Geometry} currentGeometry The current Geometry being processed.
 * @param {number} featureIndex The current index of the Feature being processed.
 * @param {Object} featureProperties The current Feature Properties being processed.
 * @param {Array<number>} featureBBox The current Feature BBox being processed.
 * @param {number|string} featureId The current Feature Id being processed.
 */

/**
 * Reduce geometry in any GeoJSON object, similar to Array.reduce().
 *
 * @name geomReduce
 * @param {FeatureCollection|Feature|Geometry} geojson any GeoJSON object
 * @param {Function} callback a method that takes (previousValue, currentGeometry, featureIndex, featureProperties, featureBBox, featureId)
 * @param {*} [initialValue] Value to use as the first argument to the first call of the callback.
 * @returns {*} The value that results from the reduction.
 * @example
 * var features = turf.featureCollection([
 *     turf.point([26, 37], {foo: 'bar'}),
 *     turf.point([36, 53], {hello: 'world'})
 * ]);
 *
 * turf.geomReduce(features, function (previousValue, currentGeometry, featureIndex, featureProperties, featureBBox, featureId) {
 *   //=previousValue
 *   //=currentGeometry
 *   //=featureIndex
 *   //=featureProperties
 *   //=featureBBox
 *   //=featureId
 *   return currentGeometry
 * });
 */
function geomReduce(geojson, callback, initialValue) {
  var previousValue = initialValue;
  geomEach(
    geojson,
    function (
      currentGeometry,
      featureIndex,
      featureProperties,
      featureBBox,
      featureId
    ) {
      if (featureIndex === 0 && initialValue === undefined)
        { previousValue = currentGeometry; }
      else
        { previousValue = callback(
          previousValue,
          currentGeometry,
          featureIndex,
          featureProperties,
          featureBBox,
          featureId
        ); }
    }
  );
  return previousValue;
}

// Note: change RADIUS => earthRadius
var RADIUS$1 = 6378137;
/**
 * Takes one or more features and returns their area in square meters.
 *
 * @name area
 * @param {GeoJSON} geojson input GeoJSON feature(s)
 * @returns {number} area in square meters
 * @example
 * var polygon = turf.polygon([[[125, -15], [113, -22], [154, -27], [144, -15], [125, -15]]]);
 *
 * var area = turf.area(polygon);
 *
 * //addToMap
 * var addToMap = [polygon]
 * polygon.properties.area = area
 */
function area(geojson) {
    return geomReduce(geojson, function (value, geom) {
        return value + calculateArea(geom);
    }, 0);
}
/**
 * Calculate Area
 *
 * @private
 * @param {Geometry} geom GeoJSON Geometries
 * @returns {number} area
 */
function calculateArea(geom) {
    var total = 0;
    var i;
    switch (geom.type) {
        case "Polygon":
            return polygonArea(geom.coordinates);
        case "MultiPolygon":
            for (i = 0; i < geom.coordinates.length; i++) {
                total += polygonArea(geom.coordinates[i]);
            }
            return total;
        case "Point":
        case "MultiPoint":
        case "LineString":
        case "MultiLineString":
            return 0;
    }
    return 0;
}
function polygonArea(coords) {
    var total = 0;
    if (coords && coords.length > 0) {
        total += Math.abs(ringArea(coords[0]));
        for (var i = 1; i < coords.length; i++) {
            total -= Math.abs(ringArea(coords[i]));
        }
    }
    return total;
}
/**
 * @private
 * Calculate the approximate area of the polygon were it projected onto the earth.
 * Note that this area will be positive if ring is oriented clockwise, otherwise it will be negative.
 *
 * Reference:
 * Robert. G. Chamberlain and William H. Duquette, "Some Algorithms for Polygons on a Sphere",
 * JPL Publication 07-03, Jet Propulsion
 * Laboratory, Pasadena, CA, June 2007 https://trs.jpl.nasa.gov/handle/2014/40409
 *
 * @param {Array<Array<number>>} coords Ring Coordinates
 * @returns {number} The approximate signed geodesic area of the polygon in square meters.
 */
function ringArea(coords) {
    var p1;
    var p2;
    var p3;
    var lowerIndex;
    var middleIndex;
    var upperIndex;
    var i;
    var total = 0;
    var coordsLength = coords.length;
    if (coordsLength > 2) {
        for (i = 0; i < coordsLength; i++) {
            if (i === coordsLength - 2) {
                // i = N-2
                lowerIndex = coordsLength - 2;
                middleIndex = coordsLength - 1;
                upperIndex = 0;
            }
            else if (i === coordsLength - 1) {
                // i = N-1
                lowerIndex = coordsLength - 1;
                middleIndex = 0;
                upperIndex = 1;
            }
            else {
                // i = 0 to N-3
                lowerIndex = i;
                middleIndex = i + 1;
                upperIndex = i + 2;
            }
            p1 = coords[lowerIndex];
            p2 = coords[middleIndex];
            p3 = coords[upperIndex];
            total += (rad$1(p3[0]) - rad$1(p1[0])) * Math.sin(rad$1(p2[1]));
        }
        total = (total * RADIUS$1 * RADIUS$1) / 2;
    }
    return total;
}
function rad$1(num) {
    return (num * Math.PI) / 180;
}

/**
 * splaytree v3.1.1
 * Fast Splay tree for Node and browser
 *
 * @author Alexander Milevski <info@w8r.name>
 * @license MIT
 * @preserve
 */

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) { throw t[1]; } return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) { throw new TypeError("Generator is already executing."); }
        while (_) { try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) { return t; }
            if (y = 0, t) { op = [op[0] & 2, t.value]; }
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) { _.ops.pop(); }
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; } }
        if (op[0] & 5) { throw op[1]; } return { value: op[0] ? op[1] : void 0, done: true };
    }
}

var Node = /** @class */ (function () {
    function Node(key, data) {
        this.next = null;
        this.key = key;
        this.data = data;
        this.left = null;
        this.right = null;
    }
    return Node;
}());

/* follows "An implementation of top-down splaying"
 * by D. Sleator <sleator@cs.cmu.edu> March 1992
 */
function DEFAULT_COMPARE(a, b) {
    return a > b ? 1 : a < b ? -1 : 0;
}
/**
 * Simple top down splay, not requiring i to be in the tree t.
 */
function splay(i, t, comparator) {
    var N = new Node(null, null);
    var l = N;
    var r = N;
    while (true) {
        var cmp = comparator(i, t.key);
        //if (i < t.key) {
        if (cmp < 0) {
            if (t.left === null)
                { break; }
            //if (i < t.left.key) {
            if (comparator(i, t.left.key) < 0) {
                var y = t.left; /* rotate right */
                t.left = y.right;
                y.right = t;
                t = y;
                if (t.left === null)
                    { break; }
            }
            r.left = t; /* link right */
            r = t;
            t = t.left;
            //} else if (i > t.key) {
        }
        else if (cmp > 0) {
            if (t.right === null)
                { break; }
            //if (i > t.right.key) {
            if (comparator(i, t.right.key) > 0) {
                var y = t.right; /* rotate left */
                t.right = y.left;
                y.left = t;
                t = y;
                if (t.right === null)
                    { break; }
            }
            l.right = t; /* link left */
            l = t;
            t = t.right;
        }
        else
            { break; }
    }
    /* assemble */
    l.right = t.left;
    r.left = t.right;
    t.left = N.right;
    t.right = N.left;
    return t;
}
function insert(i, data, t, comparator) {
    var node = new Node(i, data);
    if (t === null) {
        node.left = node.right = null;
        return node;
    }
    t = splay(i, t, comparator);
    var cmp = comparator(i, t.key);
    if (cmp < 0) {
        node.left = t.left;
        node.right = t;
        t.left = null;
    }
    else if (cmp >= 0) {
        node.right = t.right;
        node.left = t;
        t.right = null;
    }
    return node;
}
function split(key, v, comparator) {
    var left = null;
    var right = null;
    if (v) {
        v = splay(key, v, comparator);
        var cmp = comparator(v.key, key);
        if (cmp === 0) {
            left = v.left;
            right = v.right;
        }
        else if (cmp < 0) {
            right = v.right;
            v.right = null;
            left = v;
        }
        else {
            left = v.left;
            v.left = null;
            right = v;
        }
    }
    return { left: left, right: right };
}
function merge(left, right, comparator) {
    if (right === null)
        { return left; }
    if (left === null)
        { return right; }
    right = splay(left.key, right, comparator);
    right.left = left;
    return right;
}
/**
 * Prints level of the tree
 */
function printRow(root, prefix, isTail, out, printNode) {
    if (root) {
        out("" + prefix + (isTail ? '└── ' : '├── ') + printNode(root) + "\n");
        var indent = prefix + (isTail ? '    ' : '│   ');
        if (root.left)
            { printRow(root.left, indent, false, out, printNode); }
        if (root.right)
            { printRow(root.right, indent, true, out, printNode); }
    }
}
var Tree = /** @class */ (function () {
    function Tree(comparator) {
        if (comparator === void 0) { comparator = DEFAULT_COMPARE; }
        this._root = null;
        this._size = 0;
        this._comparator = comparator;
    }
    /**
     * Inserts a key, allows duplicates
     */
    Tree.prototype.insert = function (key, data) {
        this._size++;
        return this._root = insert(key, data, this._root, this._comparator);
    };
    /**
     * Adds a key, if it is not present in the tree
     */
    Tree.prototype.add = function (key, data) {
        var node = new Node(key, data);
        if (this._root === null) {
            node.left = node.right = null;
            this._size++;
            this._root = node;
        }
        var comparator = this._comparator;
        var t = splay(key, this._root, comparator);
        var cmp = comparator(key, t.key);
        if (cmp === 0)
            { this._root = t; }
        else {
            if (cmp < 0) {
                node.left = t.left;
                node.right = t;
                t.left = null;
            }
            else if (cmp > 0) {
                node.right = t.right;
                node.left = t;
                t.right = null;
            }
            this._size++;
            this._root = node;
        }
        return this._root;
    };
    /**
     * @param  {Key} key
     * @return {Node|null}
     */
    Tree.prototype.remove = function (key) {
        this._root = this._remove(key, this._root, this._comparator);
    };
    /**
     * Deletes i from the tree if it's there
     */
    Tree.prototype._remove = function (i, t, comparator) {
        var x;
        if (t === null)
            { return null; }
        t = splay(i, t, comparator);
        var cmp = comparator(i, t.key);
        if (cmp === 0) { /* found it */
            if (t.left === null) {
                x = t.right;
            }
            else {
                x = splay(i, t.left, comparator);
                x.right = t.right;
            }
            this._size--;
            return x;
        }
        return t; /* It wasn't there */
    };
    /**
     * Removes and returns the node with smallest key
     */
    Tree.prototype.pop = function () {
        var node = this._root;
        if (node) {
            while (node.left)
                { node = node.left; }
            this._root = splay(node.key, this._root, this._comparator);
            this._root = this._remove(node.key, this._root, this._comparator);
            return { key: node.key, data: node.data };
        }
        return null;
    };
    /**
     * Find without splaying
     */
    Tree.prototype.findStatic = function (key) {
        var current = this._root;
        var compare = this._comparator;
        while (current) {
            var cmp = compare(key, current.key);
            if (cmp === 0)
                { return current; }
            else if (cmp < 0)
                { current = current.left; }
            else
                { current = current.right; }
        }
        return null;
    };
    Tree.prototype.find = function (key) {
        if (this._root) {
            this._root = splay(key, this._root, this._comparator);
            if (this._comparator(key, this._root.key) !== 0)
                { return null; }
        }
        return this._root;
    };
    Tree.prototype.contains = function (key) {
        var current = this._root;
        var compare = this._comparator;
        while (current) {
            var cmp = compare(key, current.key);
            if (cmp === 0)
                { return true; }
            else if (cmp < 0)
                { current = current.left; }
            else
                { current = current.right; }
        }
        return false;
    };
    Tree.prototype.forEach = function (visitor, ctx) {
        var current = this._root;
        var Q = []; /* Initialize stack s */
        var done = false;
        while (!done) {
            if (current !== null) {
                Q.push(current);
                current = current.left;
            }
            else {
                if (Q.length !== 0) {
                    current = Q.pop();
                    visitor.call(ctx, current);
                    current = current.right;
                }
                else
                    { done = true; }
            }
        }
        return this;
    };
    /**
     * Walk key range from `low` to `high`. Stops if `fn` returns a value.
     */
    Tree.prototype.range = function (low, high, fn, ctx) {
        var Q = [];
        var compare = this._comparator;
        var node = this._root;
        var cmp;
        while (Q.length !== 0 || node) {
            if (node) {
                Q.push(node);
                node = node.left;
            }
            else {
                node = Q.pop();
                cmp = compare(node.key, high);
                if (cmp > 0) {
                    break;
                }
                else if (compare(node.key, low) >= 0) {
                    if (fn.call(ctx, node))
                        { return this; } // stop if smth is returned
                }
                node = node.right;
            }
        }
        return this;
    };
    /**
     * Returns array of keys
     */
    Tree.prototype.keys = function () {
        var keys = [];
        this.forEach(function (_a) {
            var key = _a.key;
            return keys.push(key);
        });
        return keys;
    };
    /**
     * Returns array of all the data in the nodes
     */
    Tree.prototype.values = function () {
        var values = [];
        this.forEach(function (_a) {
            var data = _a.data;
            return values.push(data);
        });
        return values;
    };
    Tree.prototype.min = function () {
        if (this._root)
            { return this.minNode(this._root).key; }
        return null;
    };
    Tree.prototype.max = function () {
        if (this._root)
            { return this.maxNode(this._root).key; }
        return null;
    };
    Tree.prototype.minNode = function (t) {
        if (t === void 0) { t = this._root; }
        if (t)
            { while (t.left)
                { t = t.left; } }
        return t;
    };
    Tree.prototype.maxNode = function (t) {
        if (t === void 0) { t = this._root; }
        if (t)
            { while (t.right)
                { t = t.right; } }
        return t;
    };
    /**
     * Returns node at given index
     */
    Tree.prototype.at = function (index) {
        var current = this._root;
        var done = false;
        var i = 0;
        var Q = [];
        while (!done) {
            if (current) {
                Q.push(current);
                current = current.left;
            }
            else {
                if (Q.length > 0) {
                    current = Q.pop();
                    if (i === index)
                        { return current; }
                    i++;
                    current = current.right;
                }
                else
                    { done = true; }
            }
        }
        return null;
    };
    Tree.prototype.next = function (d) {
        var root = this._root;
        var successor = null;
        if (d.right) {
            successor = d.right;
            while (successor.left)
                { successor = successor.left; }
            return successor;
        }
        var comparator = this._comparator;
        while (root) {
            var cmp = comparator(d.key, root.key);
            if (cmp === 0)
                { break; }
            else if (cmp < 0) {
                successor = root;
                root = root.left;
            }
            else
                { root = root.right; }
        }
        return successor;
    };
    Tree.prototype.prev = function (d) {
        var root = this._root;
        var predecessor = null;
        if (d.left !== null) {
            predecessor = d.left;
            while (predecessor.right)
                { predecessor = predecessor.right; }
            return predecessor;
        }
        var comparator = this._comparator;
        while (root) {
            var cmp = comparator(d.key, root.key);
            if (cmp === 0)
                { break; }
            else if (cmp < 0)
                { root = root.left; }
            else {
                predecessor = root;
                root = root.right;
            }
        }
        return predecessor;
    };
    Tree.prototype.clear = function () {
        this._root = null;
        this._size = 0;
        return this;
    };
    Tree.prototype.toList = function () {
        return toList(this._root);
    };
    /**
     * Bulk-load items. Both array have to be same size
     */
    Tree.prototype.load = function (keys, values, presort) {
        if (values === void 0) { values = []; }
        if (presort === void 0) { presort = false; }
        var size = keys.length;
        var comparator = this._comparator;
        // sort if needed
        if (presort)
            { sort(keys, values, 0, size - 1, comparator); }
        if (this._root === null) { // empty tree
            this._root = loadRecursive(keys, values, 0, size);
            this._size = size;
        }
        else { // that re-builds the whole tree from two in-order traversals
            var mergedList = mergeLists(this.toList(), createList(keys, values), comparator);
            size = this._size + size;
            this._root = sortedListToBST({ head: mergedList }, 0, size);
        }
        return this;
    };
    Tree.prototype.isEmpty = function () { return this._root === null; };
    Object.defineProperty(Tree.prototype, "size", {
        get: function () { return this._size; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Tree.prototype, "root", {
        get: function () { return this._root; },
        enumerable: true,
        configurable: true
    });
    Tree.prototype.toString = function (printNode) {
        if (printNode === void 0) { printNode = function (n) { return String(n.key); }; }
        var out = [];
        printRow(this._root, '', true, function (v) { return out.push(v); }, printNode);
        return out.join('');
    };
    Tree.prototype.update = function (key, newKey, newData) {
        var comparator = this._comparator;
        var _a = split(key, this._root, comparator), left = _a.left, right = _a.right;
        if (comparator(key, newKey) < 0) {
            right = insert(newKey, newData, right, comparator);
        }
        else {
            left = insert(newKey, newData, left, comparator);
        }
        this._root = merge(left, right, comparator);
    };
    Tree.prototype.split = function (key) {
        return split(key, this._root, this._comparator);
    };
    Tree.prototype[Symbol.iterator] = function () {
        var n;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    n = this.minNode();
                    _a.label = 1;
                case 1:
                    if (!n) { return [3 /*break*/, 3]; }
                    return [4 /*yield*/, n];
                case 2:
                    _a.sent();
                    n = this.next(n);
                    return [3 /*break*/, 1];
                case 3: return [2 /*return*/];
            }
        });
    };
    return Tree;
}());
function loadRecursive(keys, values, start, end) {
    var size = end - start;
    if (size > 0) {
        var middle = start + Math.floor(size / 2);
        var key = keys[middle];
        var data = values[middle];
        var node = new Node(key, data);
        node.left = loadRecursive(keys, values, start, middle);
        node.right = loadRecursive(keys, values, middle + 1, end);
        return node;
    }
    return null;
}
function createList(keys, values) {
    var head = new Node(null, null);
    var p = head;
    for (var i = 0; i < keys.length; i++) {
        p = p.next = new Node(keys[i], values[i]);
    }
    p.next = null;
    return head.next;
}
function toList(root) {
    var current = root;
    var Q = [];
    var done = false;
    var head = new Node(null, null);
    var p = head;
    while (!done) {
        if (current) {
            Q.push(current);
            current = current.left;
        }
        else {
            if (Q.length > 0) {
                current = p = p.next = Q.pop();
                current = current.right;
            }
            else
                { done = true; }
        }
    }
    p.next = null; // that'll work even if the tree was empty
    return head.next;
}
function sortedListToBST(list, start, end) {
    var size = end - start;
    if (size > 0) {
        var middle = start + Math.floor(size / 2);
        var left = sortedListToBST(list, start, middle);
        var root = list.head;
        root.left = left;
        list.head = list.head.next;
        root.right = sortedListToBST(list, middle + 1, end);
        return root;
    }
    return null;
}
function mergeLists(l1, l2, compare) {
    var head = new Node(null, null); // dummy
    var p = head;
    var p1 = l1;
    var p2 = l2;
    while (p1 !== null && p2 !== null) {
        if (compare(p1.key, p2.key) < 0) {
            p.next = p1;
            p1 = p1.next;
        }
        else {
            p.next = p2;
            p2 = p2.next;
        }
        p = p.next;
    }
    if (p1 !== null) {
        p.next = p1;
    }
    else if (p2 !== null) {
        p.next = p2;
    }
    return head.next;
}
function sort(keys, values, left, right, compare) {
    if (left >= right)
        { return; }
    var pivot = keys[(left + right) >> 1];
    var i = left - 1;
    var j = right + 1;
    while (true) {
        do
            { i++; }
        while (compare(keys[i], pivot) < 0);
        do
            { j--; }
        while (compare(keys[j], pivot) > 0);
        if (i >= j)
            { break; }
        var tmp = keys[i];
        keys[i] = keys[j];
        keys[j] = tmp;
        tmp = values[i];
        values[i] = values[j];
        values[j] = tmp;
    }
    sort(keys, values, left, j, compare);
    sort(keys, values, j + 1, right, compare);
}

function _classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
}

function _defineProperties(target, props) {
  for (var i = 0; i < props.length; i++) {
    var descriptor = props[i];
    descriptor.enumerable = descriptor.enumerable || false;
    descriptor.configurable = true;
    if ("value" in descriptor) { descriptor.writable = true; }
    Object.defineProperty(target, descriptor.key, descriptor);
  }
}

function _createClass(Constructor, protoProps, staticProps) {
  if (protoProps) { _defineProperties(Constructor.prototype, protoProps); }
  if (staticProps) { _defineProperties(Constructor, staticProps); }
  return Constructor;
}

/**
 * A bounding box has the format:
 *
 *  { ll: { x: xmin, y: ymin }, ur: { x: xmax, y: ymax } }
 *
 */
var isInBbox = function isInBbox(bbox, point) {
  return bbox.ll.x <= point.x && point.x <= bbox.ur.x && bbox.ll.y <= point.y && point.y <= bbox.ur.y;
};
/* Returns either null, or a bbox (aka an ordered pair of points)
 * If there is only one point of overlap, a bbox with identical points
 * will be returned */

var getBboxOverlap = function getBboxOverlap(b1, b2) {
  // check if the bboxes overlap at all
  if (b2.ur.x < b1.ll.x || b1.ur.x < b2.ll.x || b2.ur.y < b1.ll.y || b1.ur.y < b2.ll.y) { return null; } // find the middle two X values

  var lowerX = b1.ll.x < b2.ll.x ? b2.ll.x : b1.ll.x;
  var upperX = b1.ur.x < b2.ur.x ? b1.ur.x : b2.ur.x; // find the middle two Y values

  var lowerY = b1.ll.y < b2.ll.y ? b2.ll.y : b1.ll.y;
  var upperY = b1.ur.y < b2.ur.y ? b1.ur.y : b2.ur.y; // put those middle values together to get the overlap

  return {
    ll: {
      x: lowerX,
      y: lowerY
    },
    ur: {
      x: upperX,
      y: upperY
    }
  };
};

/* Javascript doesn't do integer math. Everything is
 * floating point with percision Number.EPSILON.
 *
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/EPSILON
 */
var epsilon = Number.EPSILON; // IE Polyfill

if (epsilon === undefined) { epsilon = Math.pow(2, -52); }
var EPSILON_SQ = epsilon * epsilon;
/* FLP comparator */

var cmp = function cmp(a, b) {
  // check if they're both 0
  if (-epsilon < a && a < epsilon) {
    if (-epsilon < b && b < epsilon) {
      return 0;
    }
  } // check if they're flp equal


  var ab = a - b;

  if (ab * ab < EPSILON_SQ * a * b) {
    return 0;
  } // normal comparison


  return a < b ? -1 : 1;
};

/**
 * This class rounds incoming values sufficiently so that
 * floating points problems are, for the most part, avoided.
 *
 * Incoming points are have their x & y values tested against
 * all previously seen x & y values. If either is 'too close'
 * to a previously seen value, it's value is 'snapped' to the
 * previously seen value.
 *
 * All points should be rounded by this class before being
 * stored in any data structures in the rest of this algorithm.
 */

var PtRounder = /*#__PURE__*/function () {
  function PtRounder() {
    _classCallCheck(this, PtRounder);

    this.reset();
  }

  _createClass(PtRounder, [{
    key: "reset",
    value: function reset() {
      this.xRounder = new CoordRounder();
      this.yRounder = new CoordRounder();
    }
  }, {
    key: "round",
    value: function round(x, y) {
      return {
        x: this.xRounder.round(x),
        y: this.yRounder.round(y)
      };
    }
  }]);

  return PtRounder;
}();

var CoordRounder = /*#__PURE__*/function () {
  function CoordRounder() {
    _classCallCheck(this, CoordRounder);

    this.tree = new Tree(); // preseed with 0 so we don't end up with values < Number.EPSILON

    this.round(0);
  } // Note: this can rounds input values backwards or forwards.
  //       You might ask, why not restrict this to just rounding
  //       forwards? Wouldn't that allow left endpoints to always
  //       remain left endpoints during splitting (never change to
  //       right). No - it wouldn't, because we snap intersections
  //       to endpoints (to establish independence from the segment
  //       angle for t-intersections).


  _createClass(CoordRounder, [{
    key: "round",
    value: function round(coord) {
      var node = this.tree.add(coord);
      var prevNode = this.tree.prev(node);

      if (prevNode !== null && cmp(node.key, prevNode.key) === 0) {
        this.tree.remove(coord);
        return prevNode.key;
      }

      var nextNode = this.tree.next(node);

      if (nextNode !== null && cmp(node.key, nextNode.key) === 0) {
        this.tree.remove(coord);
        return nextNode.key;
      }

      return coord;
    }
  }]);

  return CoordRounder;
}(); // singleton available by import


var rounder = new PtRounder();

/* Cross Product of two vectors with first point at origin */

var crossProduct = function crossProduct(a, b) {
  return a.x * b.y - a.y * b.x;
};
/* Dot Product of two vectors with first point at origin */

var dotProduct = function dotProduct(a, b) {
  return a.x * b.x + a.y * b.y;
};
/* Comparator for two vectors with same starting point */

var compareVectorAngles = function compareVectorAngles(basePt, endPt1, endPt2) {
  var v1 = {
    x: endPt1.x - basePt.x,
    y: endPt1.y - basePt.y
  };
  var v2 = {
    x: endPt2.x - basePt.x,
    y: endPt2.y - basePt.y
  };
  var kross = crossProduct(v1, v2);
  return cmp(kross, 0);
};
var length = function length(v) {
  return Math.sqrt(dotProduct(v, v));
};
/* Get the sine of the angle from pShared -> pAngle to pShaed -> pBase */

var sineOfAngle = function sineOfAngle(pShared, pBase, pAngle) {
  var vBase = {
    x: pBase.x - pShared.x,
    y: pBase.y - pShared.y
  };
  var vAngle = {
    x: pAngle.x - pShared.x,
    y: pAngle.y - pShared.y
  };
  return crossProduct(vAngle, vBase) / length(vAngle) / length(vBase);
};
/* Get the cosine of the angle from pShared -> pAngle to pShaed -> pBase */

var cosineOfAngle = function cosineOfAngle(pShared, pBase, pAngle) {
  var vBase = {
    x: pBase.x - pShared.x,
    y: pBase.y - pShared.y
  };
  var vAngle = {
    x: pAngle.x - pShared.x,
    y: pAngle.y - pShared.y
  };
  return dotProduct(vAngle, vBase) / length(vAngle) / length(vBase);
};
/* Get the x coordinate where the given line (defined by a point and vector)
 * crosses the horizontal line with the given y coordiante.
 * In the case of parrallel lines (including overlapping ones) returns null. */

var horizontalIntersection = function horizontalIntersection(pt, v, y) {
  if (v.y === 0) { return null; }
  return {
    x: pt.x + v.x / v.y * (y - pt.y),
    y: y
  };
};
/* Get the y coordinate where the given line (defined by a point and vector)
 * crosses the vertical line with the given x coordiante.
 * In the case of parrallel lines (including overlapping ones) returns null. */

var verticalIntersection = function verticalIntersection(pt, v, x) {
  if (v.x === 0) { return null; }
  return {
    x: x,
    y: pt.y + v.y / v.x * (x - pt.x)
  };
};
/* Get the intersection of two lines, each defined by a base point and a vector.
 * In the case of parrallel lines (including overlapping ones) returns null. */

var intersection = function intersection(pt1, v1, pt2, v2) {
  // take some shortcuts for vertical and horizontal lines
  // this also ensures we don't calculate an intersection and then discover
  // it's actually outside the bounding box of the line
  if (v1.x === 0) { return verticalIntersection(pt2, v2, pt1.x); }
  if (v2.x === 0) { return verticalIntersection(pt1, v1, pt2.x); }
  if (v1.y === 0) { return horizontalIntersection(pt2, v2, pt1.y); }
  if (v2.y === 0) { return horizontalIntersection(pt1, v1, pt2.y); } // General case for non-overlapping segments.
  // This algorithm is based on Schneider and Eberly.
  // http://www.cimec.org.ar/~ncalvo/Schneider_Eberly.pdf - pg 244

  var kross = crossProduct(v1, v2);
  if (kross == 0) { return null; }
  var ve = {
    x: pt2.x - pt1.x,
    y: pt2.y - pt1.y
  };
  var d1 = crossProduct(ve, v1) / kross;
  var d2 = crossProduct(ve, v2) / kross; // take the average of the two calculations to minimize rounding error

  var x1 = pt1.x + d2 * v1.x,
      x2 = pt2.x + d1 * v2.x;
  var y1 = pt1.y + d2 * v1.y,
      y2 = pt2.y + d1 * v2.y;
  var x = (x1 + x2) / 2;
  var y = (y1 + y2) / 2;
  return {
    x: x,
    y: y
  };
};

var SweepEvent = /*#__PURE__*/function () {
  _createClass(SweepEvent, null, [{
    key: "compare",
    // for ordering sweep events in the sweep event queue
    value: function compare(a, b) {
      // favor event with a point that the sweep line hits first
      var ptCmp = SweepEvent.comparePoints(a.point, b.point);
      if (ptCmp !== 0) { return ptCmp; } // the points are the same, so link them if needed

      if (a.point !== b.point) { a.link(b); } // favor right events over left

      if (a.isLeft !== b.isLeft) { return a.isLeft ? 1 : -1; } // we have two matching left or right endpoints
      // ordering of this case is the same as for their segments

      return Segment.compare(a.segment, b.segment);
    } // for ordering points in sweep line order

  }, {
    key: "comparePoints",
    value: function comparePoints(aPt, bPt) {
      if (aPt.x < bPt.x) { return -1; }
      if (aPt.x > bPt.x) { return 1; }
      if (aPt.y < bPt.y) { return -1; }
      if (aPt.y > bPt.y) { return 1; }
      return 0;
    } // Warning: 'point' input will be modified and re-used (for performance)

  }]);

  function SweepEvent(point, isLeft) {
    _classCallCheck(this, SweepEvent);

    if (point.events === undefined) { point.events = [this]; }else { point.events.push(this); }
    this.point = point;
    this.isLeft = isLeft; // this.segment, this.otherSE set by factory
  }

  _createClass(SweepEvent, [{
    key: "link",
    value: function link(other) {
      if (other.point === this.point) {
        throw new Error('Tried to link already linked events');
      }

      var otherEvents = other.point.events;

      for (var i = 0, iMax = otherEvents.length; i < iMax; i++) {
        var evt = otherEvents[i];
        this.point.events.push(evt);
        evt.point = this.point;
      }

      this.checkForConsuming();
    }
    /* Do a pass over our linked events and check to see if any pair
     * of segments match, and should be consumed. */

  }, {
    key: "checkForConsuming",
    value: function checkForConsuming() {
      // FIXME: The loops in this method run O(n^2) => no good.
      //        Maintain little ordered sweep event trees?
      //        Can we maintaining an ordering that avoids the need
      //        for the re-sorting with getLeftmostComparator in geom-out?
      // Compare each pair of events to see if other events also match
      var numEvents = this.point.events.length;

      for (var i = 0; i < numEvents; i++) {
        var evt1 = this.point.events[i];
        if (evt1.segment.consumedBy !== undefined) { continue; }

        for (var j = i + 1; j < numEvents; j++) {
          var evt2 = this.point.events[j];
          if (evt2.consumedBy !== undefined) { continue; }
          if (evt1.otherSE.point.events !== evt2.otherSE.point.events) { continue; }
          evt1.segment.consume(evt2.segment);
        }
      }
    }
  }, {
    key: "getAvailableLinkedEvents",
    value: function getAvailableLinkedEvents() {
      // point.events is always of length 2 or greater
      var events = [];

      for (var i = 0, iMax = this.point.events.length; i < iMax; i++) {
        var evt = this.point.events[i];

        if (evt !== this && !evt.segment.ringOut && evt.segment.isInResult()) {
          events.push(evt);
        }
      }

      return events;
    }
    /**
     * Returns a comparator function for sorting linked events that will
     * favor the event that will give us the smallest left-side angle.
     * All ring construction starts as low as possible heading to the right,
     * so by always turning left as sharp as possible we'll get polygons
     * without uncessary loops & holes.
     *
     * The comparator function has a compute cache such that it avoids
     * re-computing already-computed values.
     */

  }, {
    key: "getLeftmostComparator",
    value: function getLeftmostComparator(baseEvent) {
      var _this = this;

      var cache = new Map();

      var fillCache = function fillCache(linkedEvent) {
        var nextEvent = linkedEvent.otherSE;
        cache.set(linkedEvent, {
          sine: sineOfAngle(_this.point, baseEvent.point, nextEvent.point),
          cosine: cosineOfAngle(_this.point, baseEvent.point, nextEvent.point)
        });
      };

      return function (a, b) {
        if (!cache.has(a)) { fillCache(a); }
        if (!cache.has(b)) { fillCache(b); }

        var _cache$get = cache.get(a),
            asine = _cache$get.sine,
            acosine = _cache$get.cosine;

        var _cache$get2 = cache.get(b),
            bsine = _cache$get2.sine,
            bcosine = _cache$get2.cosine; // both on or above x-axis


        if (asine >= 0 && bsine >= 0) {
          if (acosine < bcosine) { return 1; }
          if (acosine > bcosine) { return -1; }
          return 0;
        } // both below x-axis


        if (asine < 0 && bsine < 0) {
          if (acosine < bcosine) { return -1; }
          if (acosine > bcosine) { return 1; }
          return 0;
        } // one above x-axis, one below


        if (bsine < asine) { return -1; }
        if (bsine > asine) { return 1; }
        return 0;
      };
    }
  }]);

  return SweepEvent;
}();

// segments and sweep events when all else is identical

var segmentId = 0;

var Segment = /*#__PURE__*/function () {
  _createClass(Segment, null, [{
    key: "compare",

    /* This compare() function is for ordering segments in the sweep
     * line tree, and does so according to the following criteria:
     *
     * Consider the vertical line that lies an infinestimal step to the
     * right of the right-more of the two left endpoints of the input
     * segments. Imagine slowly moving a point up from negative infinity
     * in the increasing y direction. Which of the two segments will that
     * point intersect first? That segment comes 'before' the other one.
     *
     * If neither segment would be intersected by such a line, (if one
     * or more of the segments are vertical) then the line to be considered
     * is directly on the right-more of the two left inputs.
     */
    value: function compare(a, b) {
      var alx = a.leftSE.point.x;
      var blx = b.leftSE.point.x;
      var arx = a.rightSE.point.x;
      var brx = b.rightSE.point.x; // check if they're even in the same vertical plane

      if (brx < alx) { return 1; }
      if (arx < blx) { return -1; }
      var aly = a.leftSE.point.y;
      var bly = b.leftSE.point.y;
      var ary = a.rightSE.point.y;
      var bry = b.rightSE.point.y; // is left endpoint of segment B the right-more?

      if (alx < blx) {
        // are the two segments in the same horizontal plane?
        if (bly < aly && bly < ary) { return 1; }
        if (bly > aly && bly > ary) { return -1; } // is the B left endpoint colinear to segment A?

        var aCmpBLeft = a.comparePoint(b.leftSE.point);
        if (aCmpBLeft < 0) { return 1; }
        if (aCmpBLeft > 0) { return -1; } // is the A right endpoint colinear to segment B ?

        var bCmpARight = b.comparePoint(a.rightSE.point);
        if (bCmpARight !== 0) { return bCmpARight; } // colinear segments, consider the one with left-more
        // left endpoint to be first (arbitrary?)

        return -1;
      } // is left endpoint of segment A the right-more?


      if (alx > blx) {
        if (aly < bly && aly < bry) { return -1; }
        if (aly > bly && aly > bry) { return 1; } // is the A left endpoint colinear to segment B?

        var bCmpALeft = b.comparePoint(a.leftSE.point);
        if (bCmpALeft !== 0) { return bCmpALeft; } // is the B right endpoint colinear to segment A?

        var aCmpBRight = a.comparePoint(b.rightSE.point);
        if (aCmpBRight < 0) { return 1; }
        if (aCmpBRight > 0) { return -1; } // colinear segments, consider the one with left-more
        // left endpoint to be first (arbitrary?)

        return 1;
      } // if we get here, the two left endpoints are in the same
      // vertical plane, ie alx === blx
      // consider the lower left-endpoint to come first


      if (aly < bly) { return -1; }
      if (aly > bly) { return 1; } // left endpoints are identical
      // check for colinearity by using the left-more right endpoint
      // is the A right endpoint more left-more?

      if (arx < brx) {
        var _bCmpARight = b.comparePoint(a.rightSE.point);

        if (_bCmpARight !== 0) { return _bCmpARight; }
      } // is the B right endpoint more left-more?


      if (arx > brx) {
        var _aCmpBRight = a.comparePoint(b.rightSE.point);

        if (_aCmpBRight < 0) { return 1; }
        if (_aCmpBRight > 0) { return -1; }
      }

      if (arx !== brx) {
        // are these two [almost] vertical segments with opposite orientation?
        // if so, the one with the lower right endpoint comes first
        var ay = ary - aly;
        var ax = arx - alx;
        var by = bry - bly;
        var bx = brx - blx;
        if (ay > ax && by < bx) { return 1; }
        if (ay < ax && by > bx) { return -1; }
      } // we have colinear segments with matching orientation
      // consider the one with more left-more right endpoint to be first


      if (arx > brx) { return 1; }
      if (arx < brx) { return -1; } // if we get here, two two right endpoints are in the same
      // vertical plane, ie arx === brx
      // consider the lower right-endpoint to come first

      if (ary < bry) { return -1; }
      if (ary > bry) { return 1; } // right endpoints identical as well, so the segments are idential
      // fall back on creation order as consistent tie-breaker

      if (a.id < b.id) { return -1; }
      if (a.id > b.id) { return 1; } // identical segment, ie a === b

      return 0;
    }
    /* Warning: a reference to ringWindings input will be stored,
     *  and possibly will be later modified */

  }]);

  function Segment(leftSE, rightSE, rings, windings) {
    _classCallCheck(this, Segment);

    this.id = ++segmentId;
    this.leftSE = leftSE;
    leftSE.segment = this;
    leftSE.otherSE = rightSE;
    this.rightSE = rightSE;
    rightSE.segment = this;
    rightSE.otherSE = leftSE;
    this.rings = rings;
    this.windings = windings; // left unset for performance, set later in algorithm
    // this.ringOut, this.consumedBy, this.prev
  }

  _createClass(Segment, [{
    key: "replaceRightSE",

    /* When a segment is split, the rightSE is replaced with a new sweep event */
    value: function replaceRightSE(newRightSE) {
      this.rightSE = newRightSE;
      this.rightSE.segment = this;
      this.rightSE.otherSE = this.leftSE;
      this.leftSE.otherSE = this.rightSE;
    }
  }, {
    key: "bbox",
    value: function bbox() {
      var y1 = this.leftSE.point.y;
      var y2 = this.rightSE.point.y;
      return {
        ll: {
          x: this.leftSE.point.x,
          y: y1 < y2 ? y1 : y2
        },
        ur: {
          x: this.rightSE.point.x,
          y: y1 > y2 ? y1 : y2
        }
      };
    }
    /* A vector from the left point to the right */

  }, {
    key: "vector",
    value: function vector() {
      return {
        x: this.rightSE.point.x - this.leftSE.point.x,
        y: this.rightSE.point.y - this.leftSE.point.y
      };
    }
  }, {
    key: "isAnEndpoint",
    value: function isAnEndpoint(pt) {
      return pt.x === this.leftSE.point.x && pt.y === this.leftSE.point.y || pt.x === this.rightSE.point.x && pt.y === this.rightSE.point.y;
    }
    /* Compare this segment with a point.
     *
     * A point P is considered to be colinear to a segment if there
     * exists a distance D such that if we travel along the segment
     * from one * endpoint towards the other a distance D, we find
     * ourselves at point P.
     *
     * Return value indicates:
     *
     *   1: point lies above the segment (to the left of vertical)
     *   0: point is colinear to segment
     *  -1: point lies below the segment (to the right of vertical)
     */

  }, {
    key: "comparePoint",
    value: function comparePoint(point) {
      if (this.isAnEndpoint(point)) { return 0; }
      var lPt = this.leftSE.point;
      var rPt = this.rightSE.point;
      var v = this.vector(); // Exactly vertical segments.

      if (lPt.x === rPt.x) {
        if (point.x === lPt.x) { return 0; }
        return point.x < lPt.x ? 1 : -1;
      } // Nearly vertical segments with an intersection.
      // Check to see where a point on the line with matching Y coordinate is.


      var yDist = (point.y - lPt.y) / v.y;
      var xFromYDist = lPt.x + yDist * v.x;
      if (point.x === xFromYDist) { return 0; } // General case.
      // Check to see where a point on the line with matching X coordinate is.

      var xDist = (point.x - lPt.x) / v.x;
      var yFromXDist = lPt.y + xDist * v.y;
      if (point.y === yFromXDist) { return 0; }
      return point.y < yFromXDist ? -1 : 1;
    }
    /**
     * Given another segment, returns the first non-trivial intersection
     * between the two segments (in terms of sweep line ordering), if it exists.
     *
     * A 'non-trivial' intersection is one that will cause one or both of the
     * segments to be split(). As such, 'trivial' vs. 'non-trivial' intersection:
     *
     *   * endpoint of segA with endpoint of segB --> trivial
     *   * endpoint of segA with point along segB --> non-trivial
     *   * endpoint of segB with point along segA --> non-trivial
     *   * point along segA with point along segB --> non-trivial
     *
     * If no non-trivial intersection exists, return null
     * Else, return null.
     */

  }, {
    key: "getIntersection",
    value: function getIntersection(other) {
      // If bboxes don't overlap, there can't be any intersections
      var tBbox = this.bbox();
      var oBbox = other.bbox();
      var bboxOverlap = getBboxOverlap(tBbox, oBbox);
      if (bboxOverlap === null) { return null; } // We first check to see if the endpoints can be considered intersections.
      // This will 'snap' intersections to endpoints if possible, and will
      // handle cases of colinearity.

      var tlp = this.leftSE.point;
      var trp = this.rightSE.point;
      var olp = other.leftSE.point;
      var orp = other.rightSE.point; // does each endpoint touch the other segment?
      // note that we restrict the 'touching' definition to only allow segments
      // to touch endpoints that lie forward from where we are in the sweep line pass

      var touchesOtherLSE = isInBbox(tBbox, olp) && this.comparePoint(olp) === 0;
      var touchesThisLSE = isInBbox(oBbox, tlp) && other.comparePoint(tlp) === 0;
      var touchesOtherRSE = isInBbox(tBbox, orp) && this.comparePoint(orp) === 0;
      var touchesThisRSE = isInBbox(oBbox, trp) && other.comparePoint(trp) === 0; // do left endpoints match?

      if (touchesThisLSE && touchesOtherLSE) {
        // these two cases are for colinear segments with matching left
        // endpoints, and one segment being longer than the other
        if (touchesThisRSE && !touchesOtherRSE) { return trp; }
        if (!touchesThisRSE && touchesOtherRSE) { return orp; } // either the two segments match exactly (two trival intersections)
        // or just on their left endpoint (one trivial intersection

        return null;
      } // does this left endpoint matches (other doesn't)


      if (touchesThisLSE) {
        // check for segments that just intersect on opposing endpoints
        if (touchesOtherRSE) {
          if (tlp.x === orp.x && tlp.y === orp.y) { return null; }
        } // t-intersection on left endpoint


        return tlp;
      } // does other left endpoint matches (this doesn't)


      if (touchesOtherLSE) {
        // check for segments that just intersect on opposing endpoints
        if (touchesThisRSE) {
          if (trp.x === olp.x && trp.y === olp.y) { return null; }
        } // t-intersection on left endpoint


        return olp;
      } // trivial intersection on right endpoints


      if (touchesThisRSE && touchesOtherRSE) { return null; } // t-intersections on just one right endpoint

      if (touchesThisRSE) { return trp; }
      if (touchesOtherRSE) { return orp; } // None of our endpoints intersect. Look for a general intersection between
      // infinite lines laid over the segments

      var pt = intersection(tlp, this.vector(), olp, other.vector()); // are the segments parrallel? Note that if they were colinear with overlap,
      // they would have an endpoint intersection and that case was already handled above

      if (pt === null) { return null; } // is the intersection found between the lines not on the segments?

      if (!isInBbox(bboxOverlap, pt)) { return null; } // round the the computed point if needed

      return rounder.round(pt.x, pt.y);
    }
    /**
     * Split the given segment into multiple segments on the given points.
     *  * Each existing segment will retain its leftSE and a new rightSE will be
     *    generated for it.
     *  * A new segment will be generated which will adopt the original segment's
     *    rightSE, and a new leftSE will be generated for it.
     *  * If there are more than two points given to split on, new segments
     *    in the middle will be generated with new leftSE and rightSE's.
     *  * An array of the newly generated SweepEvents will be returned.
     *
     * Warning: input array of points is modified
     */

  }, {
    key: "split",
    value: function split(point) {
      var newEvents = [];
      var alreadyLinked = point.events !== undefined;
      var newLeftSE = new SweepEvent(point, true);
      var newRightSE = new SweepEvent(point, false);
      var oldRightSE = this.rightSE;
      this.replaceRightSE(newRightSE);
      newEvents.push(newRightSE);
      newEvents.push(newLeftSE);
      var newSeg = new Segment(newLeftSE, oldRightSE, this.rings.slice(), this.windings.slice()); // when splitting a nearly vertical downward-facing segment,
      // sometimes one of the resulting new segments is vertical, in which
      // case its left and right events may need to be swapped

      if (SweepEvent.comparePoints(newSeg.leftSE.point, newSeg.rightSE.point) > 0) {
        newSeg.swapEvents();
      }

      if (SweepEvent.comparePoints(this.leftSE.point, this.rightSE.point) > 0) {
        this.swapEvents();
      } // in the point we just used to create new sweep events with was already
      // linked to other events, we need to check if either of the affected
      // segments should be consumed


      if (alreadyLinked) {
        newLeftSE.checkForConsuming();
        newRightSE.checkForConsuming();
      }

      return newEvents;
    }
    /* Swap which event is left and right */

  }, {
    key: "swapEvents",
    value: function swapEvents() {
      var tmpEvt = this.rightSE;
      this.rightSE = this.leftSE;
      this.leftSE = tmpEvt;
      this.leftSE.isLeft = true;
      this.rightSE.isLeft = false;

      for (var i = 0, iMax = this.windings.length; i < iMax; i++) {
        this.windings[i] *= -1;
      }
    }
    /* Consume another segment. We take their rings under our wing
     * and mark them as consumed. Use for perfectly overlapping segments */

  }, {
    key: "consume",
    value: function consume(other) {
      var consumer = this;
      var consumee = other;

      while (consumer.consumedBy) {
        consumer = consumer.consumedBy;
      }

      while (consumee.consumedBy) {
        consumee = consumee.consumedBy;
      }

      var cmp = Segment.compare(consumer, consumee);
      if (cmp === 0) { return; } // already consumed
      // the winner of the consumption is the earlier segment
      // according to sweep line ordering

      if (cmp > 0) {
        var tmp = consumer;
        consumer = consumee;
        consumee = tmp;
      } // make sure a segment doesn't consume it's prev


      if (consumer.prev === consumee) {
        var _tmp = consumer;
        consumer = consumee;
        consumee = _tmp;
      }

      for (var i = 0, iMax = consumee.rings.length; i < iMax; i++) {
        var ring = consumee.rings[i];
        var winding = consumee.windings[i];
        var index = consumer.rings.indexOf(ring);

        if (index === -1) {
          consumer.rings.push(ring);
          consumer.windings.push(winding);
        } else { consumer.windings[index] += winding; }
      }

      consumee.rings = null;
      consumee.windings = null;
      consumee.consumedBy = consumer; // mark sweep events consumed as to maintain ordering in sweep event queue

      consumee.leftSE.consumedBy = consumer.leftSE;
      consumee.rightSE.consumedBy = consumer.rightSE;
    }
    /* The first segment previous segment chain that is in the result */

  }, {
    key: "prevInResult",
    value: function prevInResult() {
      if (this._prevInResult !== undefined) { return this._prevInResult; }
      if (!this.prev) { this._prevInResult = null; }else if (this.prev.isInResult()) { this._prevInResult = this.prev; }else { this._prevInResult = this.prev.prevInResult(); }
      return this._prevInResult;
    }
  }, {
    key: "beforeState",
    value: function beforeState() {
      if (this._beforeState !== undefined) { return this._beforeState; }
      if (!this.prev) { this._beforeState = {
        rings: [],
        windings: [],
        multiPolys: []
      }; }else {
        var seg = this.prev.consumedBy || this.prev;
        this._beforeState = seg.afterState();
      }
      return this._beforeState;
    }
  }, {
    key: "afterState",
    value: function afterState() {
      if (this._afterState !== undefined) { return this._afterState; }
      var beforeState = this.beforeState();
      this._afterState = {
        rings: beforeState.rings.slice(0),
        windings: beforeState.windings.slice(0),
        multiPolys: []
      };
      var ringsAfter = this._afterState.rings;
      var windingsAfter = this._afterState.windings;
      var mpsAfter = this._afterState.multiPolys; // calculate ringsAfter, windingsAfter

      for (var i = 0, iMax = this.rings.length; i < iMax; i++) {
        var ring = this.rings[i];
        var winding = this.windings[i];
        var index = ringsAfter.indexOf(ring);

        if (index === -1) {
          ringsAfter.push(ring);
          windingsAfter.push(winding);
        } else { windingsAfter[index] += winding; }
      } // calcualte polysAfter


      var polysAfter = [];
      var polysExclude = [];

      for (var _i = 0, _iMax = ringsAfter.length; _i < _iMax; _i++) {
        if (windingsAfter[_i] === 0) { continue; } // non-zero rule

        var _ring = ringsAfter[_i];
        var poly = _ring.poly;
        if (polysExclude.indexOf(poly) !== -1) { continue; }
        if (_ring.isExterior) { polysAfter.push(poly); }else {
          if (polysExclude.indexOf(poly) === -1) { polysExclude.push(poly); }

          var _index = polysAfter.indexOf(_ring.poly);

          if (_index !== -1) { polysAfter.splice(_index, 1); }
        }
      } // calculate multiPolysAfter


      for (var _i2 = 0, _iMax2 = polysAfter.length; _i2 < _iMax2; _i2++) {
        var mp = polysAfter[_i2].multiPoly;
        if (mpsAfter.indexOf(mp) === -1) { mpsAfter.push(mp); }
      }

      return this._afterState;
    }
    /* Is this segment part of the final result? */

  }, {
    key: "isInResult",
    value: function isInResult() {
      // if we've been consumed, we're not in the result
      if (this.consumedBy) { return false; }
      if (this._isInResult !== undefined) { return this._isInResult; }
      var mpsBefore = this.beforeState().multiPolys;
      var mpsAfter = this.afterState().multiPolys;

      switch (operation.type) {
        case 'union':
          {
            // UNION - included iff:
            //  * On one side of us there is 0 poly interiors AND
            //  * On the other side there is 1 or more.
            var noBefores = mpsBefore.length === 0;
            var noAfters = mpsAfter.length === 0;
            this._isInResult = noBefores !== noAfters;
            break;
          }

        case 'intersection':
          {
            // INTERSECTION - included iff:
            //  * on one side of us all multipolys are rep. with poly interiors AND
            //  * on the other side of us, not all multipolys are repsented
            //    with poly interiors
            var least;
            var most;

            if (mpsBefore.length < mpsAfter.length) {
              least = mpsBefore.length;
              most = mpsAfter.length;
            } else {
              least = mpsAfter.length;
              most = mpsBefore.length;
            }

            this._isInResult = most === operation.numMultiPolys && least < most;
            break;
          }

        case 'xor':
          {
            // XOR - included iff:
            //  * the difference between the number of multipolys represented
            //    with poly interiors on our two sides is an odd number
            var diff = Math.abs(mpsBefore.length - mpsAfter.length);
            this._isInResult = diff % 2 === 1;
            break;
          }

        case 'difference':
          {
            // DIFFERENCE included iff:
            //  * on exactly one side, we have just the subject
            var isJustSubject = function isJustSubject(mps) {
              return mps.length === 1 && mps[0].isSubject;
            };

            this._isInResult = isJustSubject(mpsBefore) !== isJustSubject(mpsAfter);
            break;
          }

        default:
          throw new Error("Unrecognized operation type found ".concat(operation.type));
      }

      return this._isInResult;
    }
  }], [{
    key: "fromRing",
    value: function fromRing(pt1, pt2, ring) {
      var leftPt, rightPt, winding; // ordering the two points according to sweep line ordering

      var cmpPts = SweepEvent.comparePoints(pt1, pt2);

      if (cmpPts < 0) {
        leftPt = pt1;
        rightPt = pt2;
        winding = 1;
      } else if (cmpPts > 0) {
        leftPt = pt2;
        rightPt = pt1;
        winding = -1;
      } else { throw new Error("Tried to create degenerate segment at [".concat(pt1.x, ", ").concat(pt1.y, "]")); }

      var leftSE = new SweepEvent(leftPt, true);
      var rightSE = new SweepEvent(rightPt, false);
      return new Segment(leftSE, rightSE, [ring], [winding]);
    }
  }]);

  return Segment;
}();

var RingIn = /*#__PURE__*/function () {
  function RingIn(geomRing, poly, isExterior) {
    _classCallCheck(this, RingIn);

    if (!Array.isArray(geomRing) || geomRing.length === 0) {
      throw new Error('Input geometry is not a valid Polygon or MultiPolygon');
    }

    this.poly = poly;
    this.isExterior = isExterior;
    this.segments = [];

    if (typeof geomRing[0][0] !== 'number' || typeof geomRing[0][1] !== 'number') {
      throw new Error('Input geometry is not a valid Polygon or MultiPolygon');
    }

    var firstPoint = rounder.round(geomRing[0][0], geomRing[0][1]);
    this.bbox = {
      ll: {
        x: firstPoint.x,
        y: firstPoint.y
      },
      ur: {
        x: firstPoint.x,
        y: firstPoint.y
      }
    };
    var prevPoint = firstPoint;

    for (var i = 1, iMax = geomRing.length; i < iMax; i++) {
      if (typeof geomRing[i][0] !== 'number' || typeof geomRing[i][1] !== 'number') {
        throw new Error('Input geometry is not a valid Polygon or MultiPolygon');
      }

      var point = rounder.round(geomRing[i][0], geomRing[i][1]); // skip repeated points

      if (point.x === prevPoint.x && point.y === prevPoint.y) { continue; }
      this.segments.push(Segment.fromRing(prevPoint, point, this));
      if (point.x < this.bbox.ll.x) { this.bbox.ll.x = point.x; }
      if (point.y < this.bbox.ll.y) { this.bbox.ll.y = point.y; }
      if (point.x > this.bbox.ur.x) { this.bbox.ur.x = point.x; }
      if (point.y > this.bbox.ur.y) { this.bbox.ur.y = point.y; }
      prevPoint = point;
    } // add segment from last to first if last is not the same as first


    if (firstPoint.x !== prevPoint.x || firstPoint.y !== prevPoint.y) {
      this.segments.push(Segment.fromRing(prevPoint, firstPoint, this));
    }
  }

  _createClass(RingIn, [{
    key: "getSweepEvents",
    value: function getSweepEvents() {
      var sweepEvents = [];

      for (var i = 0, iMax = this.segments.length; i < iMax; i++) {
        var segment = this.segments[i];
        sweepEvents.push(segment.leftSE);
        sweepEvents.push(segment.rightSE);
      }

      return sweepEvents;
    }
  }]);

  return RingIn;
}();
var PolyIn = /*#__PURE__*/function () {
  function PolyIn(geomPoly, multiPoly) {
    _classCallCheck(this, PolyIn);

    if (!Array.isArray(geomPoly)) {
      throw new Error('Input geometry is not a valid Polygon or MultiPolygon');
    }

    this.exteriorRing = new RingIn(geomPoly[0], this, true); // copy by value

    this.bbox = {
      ll: {
        x: this.exteriorRing.bbox.ll.x,
        y: this.exteriorRing.bbox.ll.y
      },
      ur: {
        x: this.exteriorRing.bbox.ur.x,
        y: this.exteriorRing.bbox.ur.y
      }
    };
    this.interiorRings = [];

    for (var i = 1, iMax = geomPoly.length; i < iMax; i++) {
      var ring = new RingIn(geomPoly[i], this, false);
      if (ring.bbox.ll.x < this.bbox.ll.x) { this.bbox.ll.x = ring.bbox.ll.x; }
      if (ring.bbox.ll.y < this.bbox.ll.y) { this.bbox.ll.y = ring.bbox.ll.y; }
      if (ring.bbox.ur.x > this.bbox.ur.x) { this.bbox.ur.x = ring.bbox.ur.x; }
      if (ring.bbox.ur.y > this.bbox.ur.y) { this.bbox.ur.y = ring.bbox.ur.y; }
      this.interiorRings.push(ring);
    }

    this.multiPoly = multiPoly;
  }

  _createClass(PolyIn, [{
    key: "getSweepEvents",
    value: function getSweepEvents() {
      var sweepEvents = this.exteriorRing.getSweepEvents();

      for (var i = 0, iMax = this.interiorRings.length; i < iMax; i++) {
        var ringSweepEvents = this.interiorRings[i].getSweepEvents();

        for (var j = 0, jMax = ringSweepEvents.length; j < jMax; j++) {
          sweepEvents.push(ringSweepEvents[j]);
        }
      }

      return sweepEvents;
    }
  }]);

  return PolyIn;
}();
var MultiPolyIn = /*#__PURE__*/function () {
  function MultiPolyIn(geom, isSubject) {
    _classCallCheck(this, MultiPolyIn);

    if (!Array.isArray(geom)) {
      throw new Error('Input geometry is not a valid Polygon or MultiPolygon');
    }

    try {
      // if the input looks like a polygon, convert it to a multipolygon
      if (typeof geom[0][0][0] === 'number') { geom = [geom]; }
    } catch (ex) {// The input is either malformed or has empty arrays.
      // In either case, it will be handled later on.
    }

    this.polys = [];
    this.bbox = {
      ll: {
        x: Number.POSITIVE_INFINITY,
        y: Number.POSITIVE_INFINITY
      },
      ur: {
        x: Number.NEGATIVE_INFINITY,
        y: Number.NEGATIVE_INFINITY
      }
    };

    for (var i = 0, iMax = geom.length; i < iMax; i++) {
      var poly = new PolyIn(geom[i], this);
      if (poly.bbox.ll.x < this.bbox.ll.x) { this.bbox.ll.x = poly.bbox.ll.x; }
      if (poly.bbox.ll.y < this.bbox.ll.y) { this.bbox.ll.y = poly.bbox.ll.y; }
      if (poly.bbox.ur.x > this.bbox.ur.x) { this.bbox.ur.x = poly.bbox.ur.x; }
      if (poly.bbox.ur.y > this.bbox.ur.y) { this.bbox.ur.y = poly.bbox.ur.y; }
      this.polys.push(poly);
    }

    this.isSubject = isSubject;
  }

  _createClass(MultiPolyIn, [{
    key: "getSweepEvents",
    value: function getSweepEvents() {
      var sweepEvents = [];

      for (var i = 0, iMax = this.polys.length; i < iMax; i++) {
        var polySweepEvents = this.polys[i].getSweepEvents();

        for (var j = 0, jMax = polySweepEvents.length; j < jMax; j++) {
          sweepEvents.push(polySweepEvents[j]);
        }
      }

      return sweepEvents;
    }
  }]);

  return MultiPolyIn;
}();

var RingOut = /*#__PURE__*/function () {
  _createClass(RingOut, null, [{
    key: "factory",

    /* Given the segments from the sweep line pass, compute & return a series
     * of closed rings from all the segments marked to be part of the result */
    value: function factory(allSegments) {
      var ringsOut = [];

      for (var i = 0, iMax = allSegments.length; i < iMax; i++) {
        var segment = allSegments[i];
        if (!segment.isInResult() || segment.ringOut) { continue; }
        var prevEvent = null;
        var event = segment.leftSE;
        var nextEvent = segment.rightSE;
        var events = [event];
        var startingPoint = event.point;
        var intersectionLEs = [];
        /* Walk the chain of linked events to form a closed ring */

        while (true) {
          prevEvent = event;
          event = nextEvent;
          events.push(event);
          /* Is the ring complete? */

          if (event.point === startingPoint) { break; }

          while (true) {
            var availableLEs = event.getAvailableLinkedEvents();
            /* Did we hit a dead end? This shouldn't happen. Indicates some earlier
             * part of the algorithm malfunctioned... please file a bug report. */

            if (availableLEs.length === 0) {
              var firstPt = events[0].point;
              var lastPt = events[events.length - 1].point;
              throw new Error("Unable to complete output ring starting at [".concat(firstPt.x, ",") + " ".concat(firstPt.y, "]. Last matching segment found ends at") + " [".concat(lastPt.x, ", ").concat(lastPt.y, "]."));
            }
            /* Only one way to go, so cotinue on the path */


            if (availableLEs.length === 1) {
              nextEvent = availableLEs[0].otherSE;
              break;
            }
            /* We must have an intersection. Check for a completed loop */


            var indexLE = null;

            for (var j = 0, jMax = intersectionLEs.length; j < jMax; j++) {
              if (intersectionLEs[j].point === event.point) {
                indexLE = j;
                break;
              }
            }
            /* Found a completed loop. Cut that off and make a ring */


            if (indexLE !== null) {
              var intersectionLE = intersectionLEs.splice(indexLE)[0];
              var ringEvents = events.splice(intersectionLE.index);
              ringEvents.unshift(ringEvents[0].otherSE);
              ringsOut.push(new RingOut(ringEvents.reverse()));
              continue;
            }
            /* register the intersection */


            intersectionLEs.push({
              index: events.length,
              point: event.point
            });
            /* Choose the left-most option to continue the walk */

            var comparator = event.getLeftmostComparator(prevEvent);
            nextEvent = availableLEs.sort(comparator)[0].otherSE;
            break;
          }
        }

        ringsOut.push(new RingOut(events));
      }

      return ringsOut;
    }
  }]);

  function RingOut(events) {
    _classCallCheck(this, RingOut);

    this.events = events;

    for (var i = 0, iMax = events.length; i < iMax; i++) {
      events[i].segment.ringOut = this;
    }

    this.poly = null;
  }

  _createClass(RingOut, [{
    key: "getGeom",
    value: function getGeom() {
      // Remove superfluous points (ie extra points along a straight line),
      var prevPt = this.events[0].point;
      var points = [prevPt];

      for (var i = 1, iMax = this.events.length - 1; i < iMax; i++) {
        var _pt = this.events[i].point;
        var _nextPt = this.events[i + 1].point;
        if (compareVectorAngles(_pt, prevPt, _nextPt) === 0) { continue; }
        points.push(_pt);
        prevPt = _pt;
      } // ring was all (within rounding error of angle calc) colinear points


      if (points.length === 1) { return null; } // check if the starting point is necessary

      var pt = points[0];
      var nextPt = points[1];
      if (compareVectorAngles(pt, prevPt, nextPt) === 0) { points.shift(); }
      points.push(points[0]);
      var step = this.isExteriorRing() ? 1 : -1;
      var iStart = this.isExteriorRing() ? 0 : points.length - 1;
      var iEnd = this.isExteriorRing() ? points.length : -1;
      var orderedPoints = [];

      for (var _i = iStart; _i != iEnd; _i += step) {
        orderedPoints.push([points[_i].x, points[_i].y]);
      }

      return orderedPoints;
    }
  }, {
    key: "isExteriorRing",
    value: function isExteriorRing() {
      if (this._isExteriorRing === undefined) {
        var enclosing = this.enclosingRing();
        this._isExteriorRing = enclosing ? !enclosing.isExteriorRing() : true;
      }

      return this._isExteriorRing;
    }
  }, {
    key: "enclosingRing",
    value: function enclosingRing() {
      if (this._enclosingRing === undefined) {
        this._enclosingRing = this._calcEnclosingRing();
      }

      return this._enclosingRing;
    }
    /* Returns the ring that encloses this one, if any */

  }, {
    key: "_calcEnclosingRing",
    value: function _calcEnclosingRing() {
      // start with the ealier sweep line event so that the prevSeg
      // chain doesn't lead us inside of a loop of ours
      var leftMostEvt = this.events[0];

      for (var i = 1, iMax = this.events.length; i < iMax; i++) {
        var evt = this.events[i];
        if (SweepEvent.compare(leftMostEvt, evt) > 0) { leftMostEvt = evt; }
      }

      var prevSeg = leftMostEvt.segment.prevInResult();
      var prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;

      while (true) {
        // no segment found, thus no ring can enclose us
        if (!prevSeg) { return null; } // no segments below prev segment found, thus the ring of the prev
        // segment must loop back around and enclose us

        if (!prevPrevSeg) { return prevSeg.ringOut; } // if the two segments are of different rings, the ring of the prev
        // segment must either loop around us or the ring of the prev prev
        // seg, which would make us and the ring of the prev peers

        if (prevPrevSeg.ringOut !== prevSeg.ringOut) {
          if (prevPrevSeg.ringOut.enclosingRing() !== prevSeg.ringOut) {
            return prevSeg.ringOut;
          } else { return prevSeg.ringOut.enclosingRing(); }
        } // two segments are from the same ring, so this was a penisula
        // of that ring. iterate downward, keep searching


        prevSeg = prevPrevSeg.prevInResult();
        prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;
      }
    }
  }]);

  return RingOut;
}();
var PolyOut = /*#__PURE__*/function () {
  function PolyOut(exteriorRing) {
    _classCallCheck(this, PolyOut);

    this.exteriorRing = exteriorRing;
    exteriorRing.poly = this;
    this.interiorRings = [];
  }

  _createClass(PolyOut, [{
    key: "addInterior",
    value: function addInterior(ring) {
      this.interiorRings.push(ring);
      ring.poly = this;
    }
  }, {
    key: "getGeom",
    value: function getGeom() {
      var geom = [this.exteriorRing.getGeom()]; // exterior ring was all (within rounding error of angle calc) colinear points

      if (geom[0] === null) { return null; }

      for (var i = 0, iMax = this.interiorRings.length; i < iMax; i++) {
        var ringGeom = this.interiorRings[i].getGeom(); // interior ring was all (within rounding error of angle calc) colinear points

        if (ringGeom === null) { continue; }
        geom.push(ringGeom);
      }

      return geom;
    }
  }]);

  return PolyOut;
}();
var MultiPolyOut = /*#__PURE__*/function () {
  function MultiPolyOut(rings) {
    _classCallCheck(this, MultiPolyOut);

    this.rings = rings;
    this.polys = this._composePolys(rings);
  }

  _createClass(MultiPolyOut, [{
    key: "getGeom",
    value: function getGeom() {
      var geom = [];

      for (var i = 0, iMax = this.polys.length; i < iMax; i++) {
        var polyGeom = this.polys[i].getGeom(); // exterior ring was all (within rounding error of angle calc) colinear points

        if (polyGeom === null) { continue; }
        geom.push(polyGeom);
      }

      return geom;
    }
  }, {
    key: "_composePolys",
    value: function _composePolys(rings) {
      var polys = [];

      for (var i = 0, iMax = rings.length; i < iMax; i++) {
        var ring = rings[i];
        if (ring.poly) { continue; }
        if (ring.isExteriorRing()) { polys.push(new PolyOut(ring)); }else {
          var enclosingRing = ring.enclosingRing();
          if (!enclosingRing.poly) { polys.push(new PolyOut(enclosingRing)); }
          enclosingRing.poly.addInterior(ring);
        }
      }

      return polys;
    }
  }]);

  return MultiPolyOut;
}();

/**
 * NOTE:  We must be careful not to change any segments while
 *        they are in the SplayTree. AFAIK, there's no way to tell
 *        the tree to rebalance itself - thus before splitting
 *        a segment that's in the tree, we remove it from the tree,
 *        do the split, then re-insert it. (Even though splitting a
 *        segment *shouldn't* change its correct position in the
 *        sweep line tree, the reality is because of rounding errors,
 *        it sometimes does.)
 */

var SweepLine = /*#__PURE__*/function () {
  function SweepLine(queue) {
    var comparator = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : Segment.compare;

    _classCallCheck(this, SweepLine);

    this.queue = queue;
    this.tree = new Tree(comparator);
    this.segments = [];
  }

  _createClass(SweepLine, [{
    key: "process",
    value: function process(event) {
      var segment = event.segment;
      var newEvents = []; // if we've already been consumed by another segment,
      // clean up our body parts and get out

      if (event.consumedBy) {
        if (event.isLeft) { this.queue.remove(event.otherSE); }else { this.tree.remove(segment); }
        return newEvents;
      }

      var node = event.isLeft ? this.tree.insert(segment) : this.tree.find(segment);
      if (!node) { throw new Error("Unable to find segment #".concat(segment.id, " ") + "[".concat(segment.leftSE.point.x, ", ").concat(segment.leftSE.point.y, "] -> ") + "[".concat(segment.rightSE.point.x, ", ").concat(segment.rightSE.point.y, "] ") + 'in SweepLine tree. Please submit a bug report.'); }
      var prevNode = node;
      var nextNode = node;
      var prevSeg = undefined;
      var nextSeg = undefined; // skip consumed segments still in tree

      while (prevSeg === undefined) {
        prevNode = this.tree.prev(prevNode);
        if (prevNode === null) { prevSeg = null; }else if (prevNode.key.consumedBy === undefined) { prevSeg = prevNode.key; }
      } // skip consumed segments still in tree


      while (nextSeg === undefined) {
        nextNode = this.tree.next(nextNode);
        if (nextNode === null) { nextSeg = null; }else if (nextNode.key.consumedBy === undefined) { nextSeg = nextNode.key; }
      }

      if (event.isLeft) {
        // Check for intersections against the previous segment in the sweep line
        var prevMySplitter = null;

        if (prevSeg) {
          var prevInter = prevSeg.getIntersection(segment);

          if (prevInter !== null) {
            if (!segment.isAnEndpoint(prevInter)) { prevMySplitter = prevInter; }

            if (!prevSeg.isAnEndpoint(prevInter)) {
              var newEventsFromSplit = this._splitSafely(prevSeg, prevInter);

              for (var i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) {
                newEvents.push(newEventsFromSplit[i]);
              }
            }
          }
        } // Check for intersections against the next segment in the sweep line


        var nextMySplitter = null;

        if (nextSeg) {
          var nextInter = nextSeg.getIntersection(segment);

          if (nextInter !== null) {
            if (!segment.isAnEndpoint(nextInter)) { nextMySplitter = nextInter; }

            if (!nextSeg.isAnEndpoint(nextInter)) {
              var _newEventsFromSplit = this._splitSafely(nextSeg, nextInter);

              for (var _i = 0, _iMax = _newEventsFromSplit.length; _i < _iMax; _i++) {
                newEvents.push(_newEventsFromSplit[_i]);
              }
            }
          }
        } // For simplicity, even if we find more than one intersection we only
        // spilt on the 'earliest' (sweep-line style) of the intersections.
        // The other intersection will be handled in a future process().


        if (prevMySplitter !== null || nextMySplitter !== null) {
          var mySplitter = null;
          if (prevMySplitter === null) { mySplitter = nextMySplitter; }else if (nextMySplitter === null) { mySplitter = prevMySplitter; }else {
            var cmpSplitters = SweepEvent.comparePoints(prevMySplitter, nextMySplitter);
            mySplitter = cmpSplitters <= 0 ? prevMySplitter : nextMySplitter;
          } // Rounding errors can cause changes in ordering,
          // so remove afected segments and right sweep events before splitting

          this.queue.remove(segment.rightSE);
          newEvents.push(segment.rightSE);

          var _newEventsFromSplit2 = segment.split(mySplitter);

          for (var _i2 = 0, _iMax2 = _newEventsFromSplit2.length; _i2 < _iMax2; _i2++) {
            newEvents.push(_newEventsFromSplit2[_i2]);
          }
        }

        if (newEvents.length > 0) {
          // We found some intersections, so re-do the current event to
          // make sure sweep line ordering is totally consistent for later
          // use with the segment 'prev' pointers
          this.tree.remove(segment);
          newEvents.push(event);
        } else {
          // done with left event
          this.segments.push(segment);
          segment.prev = prevSeg;
        }
      } else {
        // event.isRight
        // since we're about to be removed from the sweep line, check for
        // intersections between our previous and next segments
        if (prevSeg && nextSeg) {
          var inter = prevSeg.getIntersection(nextSeg);

          if (inter !== null) {
            if (!prevSeg.isAnEndpoint(inter)) {
              var _newEventsFromSplit3 = this._splitSafely(prevSeg, inter);

              for (var _i3 = 0, _iMax3 = _newEventsFromSplit3.length; _i3 < _iMax3; _i3++) {
                newEvents.push(_newEventsFromSplit3[_i3]);
              }
            }

            if (!nextSeg.isAnEndpoint(inter)) {
              var _newEventsFromSplit4 = this._splitSafely(nextSeg, inter);

              for (var _i4 = 0, _iMax4 = _newEventsFromSplit4.length; _i4 < _iMax4; _i4++) {
                newEvents.push(_newEventsFromSplit4[_i4]);
              }
            }
          }
        }

        this.tree.remove(segment);
      }

      return newEvents;
    }
    /* Safely split a segment that is currently in the datastructures
     * IE - a segment other than the one that is currently being processed. */

  }, {
    key: "_splitSafely",
    value: function _splitSafely(seg, pt) {
      // Rounding errors can cause changes in ordering,
      // so remove afected segments and right sweep events before splitting
      // removeNode() doesn't work, so have re-find the seg
      // https://github.com/w8r/splay-tree/pull/5
      this.tree.remove(seg);
      var rightSE = seg.rightSE;
      this.queue.remove(rightSE);
      var newEvents = seg.split(pt);
      newEvents.push(rightSE); // splitting can trigger consumption

      if (seg.consumedBy === undefined) { this.tree.insert(seg); }
      return newEvents;
    }
  }]);

  return SweepLine;
}();

var POLYGON_CLIPPING_MAX_QUEUE_SIZE = typeof process !== 'undefined' && process.env.POLYGON_CLIPPING_MAX_QUEUE_SIZE || 1000000;
var POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS = typeof process !== 'undefined' && process.env.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS || 1000000;
var Operation = /*#__PURE__*/function () {
  function Operation() {
    _classCallCheck(this, Operation);
  }

  _createClass(Operation, [{
    key: "run",
    value: function run(type, geom, moreGeoms) {
      operation.type = type;
      rounder.reset();
      /* Convert inputs to MultiPoly objects */

      var multipolys = [new MultiPolyIn(geom, true)];

      for (var i = 0, iMax = moreGeoms.length; i < iMax; i++) {
        multipolys.push(new MultiPolyIn(moreGeoms[i], false));
      }

      operation.numMultiPolys = multipolys.length;
      /* BBox optimization for difference operation
       * If the bbox of a multipolygon that's part of the clipping doesn't
       * intersect the bbox of the subject at all, we can just drop that
       * multiploygon. */

      if (operation.type === 'difference') {
        // in place removal
        var subject = multipolys[0];
        var _i = 1;

        while (_i < multipolys.length) {
          if (getBboxOverlap(multipolys[_i].bbox, subject.bbox) !== null) { _i++; }else { multipolys.splice(_i, 1); }
        }
      }
      /* BBox optimization for intersection operation
       * If we can find any pair of multipolygons whose bbox does not overlap,
       * then the result will be empty. */


      if (operation.type === 'intersection') {
        // TODO: this is O(n^2) in number of polygons. By sorting the bboxes,
        //       it could be optimized to O(n * ln(n))
        for (var _i2 = 0, _iMax = multipolys.length; _i2 < _iMax; _i2++) {
          var mpA = multipolys[_i2];

          for (var j = _i2 + 1, jMax = multipolys.length; j < jMax; j++) {
            if (getBboxOverlap(mpA.bbox, multipolys[j].bbox) === null) { return []; }
          }
        }
      }
      /* Put segment endpoints in a priority queue */


      var queue = new Tree(SweepEvent.compare);

      for (var _i3 = 0, _iMax2 = multipolys.length; _i3 < _iMax2; _i3++) {
        var sweepEvents = multipolys[_i3].getSweepEvents();

        for (var _j = 0, _jMax = sweepEvents.length; _j < _jMax; _j++) {
          queue.insert(sweepEvents[_j]);

          if (queue.size > POLYGON_CLIPPING_MAX_QUEUE_SIZE) {
            // prevents an infinite loop, an otherwise common manifestation of bugs
            throw new Error('Infinite loop when putting segment endpoints in a priority queue ' + '(queue size too big). Please file a bug report.');
          }
        }
      }
      /* Pass the sweep line over those endpoints */


      var sweepLine = new SweepLine(queue);
      var prevQueueSize = queue.size;
      var node = queue.pop();

      while (node) {
        var evt = node.key;

        if (queue.size === prevQueueSize) {
          // prevents an infinite loop, an otherwise common manifestation of bugs
          var seg = evt.segment;
          throw new Error("Unable to pop() ".concat(evt.isLeft ? 'left' : 'right', " SweepEvent ") + "[".concat(evt.point.x, ", ").concat(evt.point.y, "] from segment #").concat(seg.id, " ") + "[".concat(seg.leftSE.point.x, ", ").concat(seg.leftSE.point.y, "] -> ") + "[".concat(seg.rightSE.point.x, ", ").concat(seg.rightSE.point.y, "] from queue. ") + 'Please file a bug report.');
        }

        if (queue.size > POLYGON_CLIPPING_MAX_QUEUE_SIZE) {
          // prevents an infinite loop, an otherwise common manifestation of bugs
          throw new Error('Infinite loop when passing sweep line over endpoints ' + '(queue size too big). Please file a bug report.');
        }

        if (sweepLine.segments.length > POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS) {
          // prevents an infinite loop, an otherwise common manifestation of bugs
          throw new Error('Infinite loop when passing sweep line over endpoints ' + '(too many sweep line segments). Please file a bug report.');
        }

        var newEvents = sweepLine.process(evt);

        for (var _i4 = 0, _iMax3 = newEvents.length; _i4 < _iMax3; _i4++) {
          var _evt = newEvents[_i4];
          if (_evt.consumedBy === undefined) { queue.insert(_evt); }
        }

        prevQueueSize = queue.size;
        node = queue.pop();
      } // free some memory we don't need anymore


      rounder.reset();
      /* Collect and compile segments we're keeping into a multipolygon */

      var ringsOut = RingOut.factory(sweepLine.segments);
      var result = new MultiPolyOut(ringsOut);
      return result.getGeom();
    }
  }]);

  return Operation;
}(); // singleton available by import

var operation = new Operation();

var union = function union(geom) {
  var arguments$1 = arguments;

  for (var _len = arguments.length, moreGeoms = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    moreGeoms[_key - 1] = arguments$1[_key];
  }

  return operation.run('union', geom, moreGeoms);
};

var intersection$1 = function intersection(geom) {
  var arguments$1 = arguments;

  for (var _len2 = arguments.length, moreGeoms = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
    moreGeoms[_key2 - 1] = arguments$1[_key2];
  }

  return operation.run('intersection', geom, moreGeoms);
};

var xor = function xor(geom) {
  var arguments$1 = arguments;

  for (var _len3 = arguments.length, moreGeoms = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
    moreGeoms[_key3 - 1] = arguments$1[_key3];
  }

  return operation.run('xor', geom, moreGeoms);
};

var difference = function difference(subjectGeom) {
  var arguments$1 = arguments;

  for (var _len4 = arguments.length, clippingGeoms = new Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1; _key4 < _len4; _key4++) {
    clippingGeoms[_key4 - 1] = arguments$1[_key4];
  }

  return operation.run('difference', subjectGeom, clippingGeoms);
};

var index = {
  union: union,
  intersection: intersection$1,
  xor: xor,
  difference: difference
};

/**
 * Takes any type of {@link Polygon|polygon} and an optional mask and returns a {@link Polygon|polygon} exterior ring with holes.
 *
 * @name mask
 * @param {FeatureCollection|Feature<Polygon|MultiPolygon>} polygon GeoJSON Polygon used as interior rings or holes.
 * @param {Feature<Polygon>} [mask] GeoJSON Polygon used as the exterior ring (if undefined, the world extent is used)
 * @returns {Feature<Polygon>} Masked Polygon (exterior ring with holes).
 * @example
 * var polygon = turf.polygon([[[112, -21], [116, -36], [146, -39], [153, -24], [133, -10], [112, -21]]]);
 * var mask = turf.polygon([[[90, -55], [170, -55], [170, 10], [90, 10], [90, -55]]]);
 *
 * var masked = turf.mask(polygon, mask);
 *
 * //addToMap
 * var addToMap = [masked]
 */
function mask(polygon, mask) {
  // Define mask
  var maskPolygon = createMask(mask);

  var polygonOuters = null;
  if (polygon.type === "FeatureCollection") { polygonOuters = unionFc(polygon); }
  else
    { polygonOuters = createGeomFromPolygonClippingOutput(
      index.union(polygon.geometry.coordinates)
    ); }

  polygonOuters.geometry.coordinates.forEach(function (contour) {
    maskPolygon.geometry.coordinates.push(contour[0]);
  });

  return maskPolygon;
}

function unionFc(fc) {
  var unioned =
    fc.features.length === 2
      ? index.union(
          fc.features[0].geometry.coordinates,
          fc.features[1].geometry.coordinates
        )
      : index.union.apply(
          index,
          fc.features.map(function (f) {
            return f.geometry.coordinates;
          })
        );
  return createGeomFromPolygonClippingOutput(unioned);
}

function createGeomFromPolygonClippingOutput(unioned) {
  return multiPolygon(unioned);
}

/**
 * Create Mask Coordinates
 *
 * @private
 * @param {Feature<Polygon>} [mask] default to world if undefined
 * @returns {Feature<Polygon>} mask coordinate
 */
function createMask(mask) {
  var world = [
    [
      [180, 90],
      [-180, 90],
      [-180, -90],
      [180, -90],
      [180, 90] ] ];
  var coordinates = (mask && mask.geometry.coordinates) || world;
  return polygon(coordinates);
}

// 'use strict';

var RADIUS = 6378137;
var rad = function(num) {return num * Math.PI / 180.0;};

/**
 * Create Selafin Object - opentelemac.org
 * @param {Buffer} buffer - Buffer containing binary information
 * @param {Object} options - Optional information
 * @returns {Object} Selafin - a Selafin object
 */
var Selafin = function Selafin(buffer,options){
      if(!options){ options={}; }
      this.debug = options.debug || false;
      this.keepframes = (typeof options.keepframes==='undefined')?true:options.keepframes;
        
      (buffer)?this.initialised(buffer):this.initialisedBlank();
  };

var prototypeAccessors = { TRIXY: { configurable: true },varnames: { configurable: true },XY: { configurable: true },IKLEW: { configurable: true },EDGES: { configurable: true },BEDGES: { configurable: true },IEDGES: { configurable: true },CX: { configurable: true },CY: { configurable: true },TRIAREA: { configurable: true },TRIBBOX: { configurable: true },BBOX: { configurable: true },EXTENT: { configurable: true },POLYGON: { configurable: true },EXTERIOR: { configurable: true },INTERIORS: { configurable: true },POLYGONS: { configurable: true } };
  Selafin.prototype.initialisedBlank = function initialisedBlank (){
      this.file = {endian:'>',float:['f',4]};
      this.TITLE = '';
      this.NBV1 = 0; this.NBV2 = 0; this.NVAR = this.NBV1 + this.NBV2;
      this.VARINDEX = range(this.NVAR);
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
      var l,chk;
      (assign = bufferpack.unpack(endian+'i'+ nchar +'si',uint8array,0), l = assign[0], assign[1], chk = assign[2]);
      if (chk!=nchar){
          endian = "<";
          (assign$1 = bufferpack.unpack(endian+'i'+ nchar +'si',uint8array,0), l = assign$1[0], assign$1[1], chk = assign$1[2]);
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
      var pos=0;
      // ~~ Read title ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      (assign = bufferpack.unpack(endian+'i80si',uint8array,pos), assign[0], this.TITLE = assign[1], assign[2]);
      pos+=4+80+4;
      // ~~ Read NBV(1) and NBV(2) ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      (assign$1 = bufferpack.unpack(endian+'iiii',uint8array,pos), assign$1[0], this.NBV1 = assign$1[1], this.NBV2 = assign$1[2], assign$1[3]);
      pos+=4+8+4;
      this.NVAR = this.NBV1 + this.NBV2;
      this.VARINDEX = range(this.NVAR,'Uint8Array');
      // ~~ Read variable names and units ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      this.VARNAMES = []; this.VARUNITS = [];
      this.CLDNAMES = []; this.CLDUNITS = [];
      for(var i=0;i<this.NBV1;i++){
          var vn = (void 0),vu = (void 0);
          (assign$2 = bufferpack.unpack(endian+'i16s16si',uint8array,pos), assign$2[0], vn = assign$2[1], vu = assign$2[2], assign$2[3]);
          pos+=4+16+16+4;
          this.VARNAMES.push(vn);
          this.VARUNITS.push(vu);
      }
      for(var i$1=0;i$1<this.NBV2;i$1++){
          var vn$1 = (void 0),vu$1 = (void 0);
          (assign$3 = bufferpack.unpack(endian+'i16s16si',uint8array,pos), assign$3[0], vn$1 = assign$3[1], vu$1 = assign$3[2], assign$3[3]);
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
    
      // ~~ Read NELEM3, NPOIN3, NDP3, NPLAN ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      (assign = bufferpack.unpack(endian+'6i',uint8array,pos), assign[0], this.NELEM3 = assign[1], this.NPOIN3 = assign[2], this.NDP3 = assign[3], this.NPLAN = assign[4], assign[5]);
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
      buffer=Buffer.concat([buffer,bufferpack.pack(endian+(this.NELEM3*this.NDP3) + "i",this.IKLE3F.add(1))]); // TODO change IKLEF to IKLE ; index to id;
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
      if (!(t >= 0 && t < this.NFRAME)) { throw Error(("Check frame(" + (this.NFRAME) + ") id=" + t + " ")); } 
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
  prototypeAccessors.TRIXY.get = function (){
      if (!(this._TRIXY)) { this.getTriXY(); }
      return this._TRIXY;
  };
  prototypeAccessors.varnames.get = function (){
      return this.VARNAMES.map(function (name){ return name.replace(/\s/g, '').toLowerCase(); });
  };  
  Selafin.prototype.getVarIndex = function getVarIndex (id){
      return this.varnames.findIndex(function (name){ return name==id; });
  };
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
  prototypeAccessors.BBOX.get = function (){
      return this.EXTENT;
  };
  prototypeAccessors.EXTENT.get = function (){
      if (!(this._EXTENT)){ this.getExtent(); }
      return this._EXTENT;
  };
  prototypeAccessors.POLYGON.get = function (){
      if (!(this._POLYGON)){ this.getPolygon(); }
      return this._POLYGON;
  };
  prototypeAccessors.EXTERIOR.get = function (){
      if (!(this._EXTERIOR)){ this.getExtInt(); }
      return this._EXTERIOR;
  };
  prototypeAccessors.INTERIORS.get = function (){
      if (!(this._INTERIORS)){ this.getExtInt(); }
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
  Selafin.prototype.getExtInt = function getExtInt (){
      if (this.debug) { console.time('Get exterior/interiors'); }
      var polygons = this.POLYGONS;
      var areas = polygons.map(function (pol){ return area(pol); });
      var interiors = this._INTERIORS = areas.sortIndices(true).map(function (i){ return polygons[i]; });
      this._EXTERIOR= interiors.shift();
      if (this.debug) { console.timeEnd('Get exterior/interiors'); }
  };
  Selafin.prototype.getCoordinate = function getCoordinate (i){
      return [this.MESHX[i],this.MESHY[i]];
  };
  Selafin.prototype.getPolygon = function getPolygon (){
      if (this.debug) { console.time('Get polygon'); }
      if(this.INTERIORS.length==0){this._POLYGON =this.EXTERIOR;}
      else {this._POLYGON = mask(featureCollection(this.INTERIORS),this.EXTERIOR);}
      if (this.debug) { console.timeEnd('Get polygon'); }
  };
  Selafin.prototype.getPolygons = function getPolygons (){
      // ~~> get outlines (boundary edges)/polygons
      if (this.debug) { console.time('Get polygons'); }
      var bedges=this.BEDGES;
      var pols =this._POLYGONS= [];
      var index,start,end=-1,pol=[];
      while(bedges.length>0){
          index=bedges.findIndex(function (item){ return item.start==end || item.end==end; });
          if(index==-1){
              if(pol.length>0){pols.push(polygon([pol]));pol=[];}
              start=bedges[0].start;
              end=bedges[0].end;
              pol.push(this.getCoordinate(start));
              pol.push(this.getCoordinate(end));
              bedges.splice(0,1);
          } else {
              end=(bedges[index].start==end)?bedges[index].end:bedges[index].start;
              pol.push(this.getCoordinate(end));
              bedges.splice(index,1);
              if(bedges.length==0 && pol.length>0){ pols.push(polygon([pol])); }
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
      // ~~> get points (x,y)
      if (this.debug) { console.time('Get points xy'); }
      var xy = this._XY = new Float32Array(this.NPOIN3*3);
      for(var i=0,j=0,n=this.NPOIN3;i<n;i++,j+=3){
          xy[j] = this.MESHX[i];
          xy[j+1] = this.MESHY[i];
          // xy[j+2] = this.MESHZ[i];
      }
      if (this.debug) { console.timeEnd('Get points xy'); }
  };
  Selafin.prototype.getBEDGES = function getBEDGES (){
      // ~~> get exterior edges
      if (this.debug) { console.time('Get boundary edges'); }
      var edges = this.EDGES;
      this._BEDGES = Object.keys(edges).filter(function (key){ return !edges[key].boundary; }).map(function (key){ return edges[key]; });
      if (this.debug) { console.timeEnd('Get boundary edges'); }
  };
  Selafin.prototype.getIEDGES = function getIEDGES (){
      // ~~> get interior edges
      if (this.debug) { console.time('Get interior edges'); }
      var edges = this.EDGES;
      this._IEDGES = Object.keys(edges).filter(function (key){ return edges[key].boundary; }).map(function (key){ return edges[key]; });
      if (this.debug) { console.timeEnd('Get interior edges'); }
  };  
  Selafin.prototype.getEDGES = function getEDGES (){
      // ~~> get edges
      if (this.debug) { console.time('Get edges'); }
      var edges = this._EDGES = {};
      var n1,n2,n3,_n1,_n2,_n3;
      for (vare = 0; e < this.NELEM3; e++ )
      {
          n1 = this.IKLE3[e];
          n2 = this.IKLE3[e+this.NELEM3];
          n3 = this.IKLE3[e+2*this.NELEM3];
      
          _n1 = (Math.min(n1,n2)) + "-" + (Math.max(n1,n2));
          _n2 = (Math.min(n2,n3)) + "-" + (Math.max(n2,n3));
          _n3 = (Math.min(n3,n1)) + "-" + (Math.max(n3,n1));
            
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
      var area = this._TRIAREA = new Float32Array(this.NELEM3);
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
          // area[i] = Math.abs(0.5 * ((this.MESHX[n2] - this.MESHX[n1]) * (this.MESHY[n3] - this.MESHY[n1]) - 
          //         (this.MESHX[n3] - this.MESHX[n1]) * (this.MESHY[n2] - this.MESHY[n1])
          // ));
          // https://github.com/Turfjs/turf/tree/master/packages/turf-area
          var points = [
              [this.MESHX[n1],this.MESHY[n1]],
              [this.MESHX[n2],this.MESHY[n2]],
              [this.MESHX[n3],this.MESHY[n3]]
          ];
          var total = 0.0;
          total += (rad(points[2][0]) - rad(points[0][0])) * Math.sin(rad(points[1][1]));
          total += (rad(points[1][0]) - rad(points[2][0])) * Math.sin(rad(points[0][1]));
          total += (rad(points[0][0]) - rad(points[1][0])) * Math.sin(rad(points[2][1]));
          area[i] = total * RADIUS * RADIUS * 0.5;
            
            
      }
      if (this.debug) { console.timeEnd('Get element attributes'); }
  };
  
  //{STRING} title  
  Selafin.prototype.addTITLE = function addTITLE (title){
      this.TITLE = "" + (title.rpad(" ", 80));
  };

  //{OBJECT (name:str,unit:str)}
  Selafin.prototype.addVAR = function addVAR (obj){
      if(!obj){ obj={}; }
      var name = obj.name || 'NewVariable';
      var unit = obj.unit || 'NewUnit';
      this.NBV1 += 1;
      this.NVAR = this.NBV1 + this.NBV2;
      this.VARINDEX = range(this.NVAR);
      this.VARNAMES.push(("" + (name.rpad(" ", 16)))); 
      this.VARUNITS.push(("" + (unit.rpad(" ", 16)))); 
  };
  
   
  Selafin.prototype.addPOINTS = function addPOINTS (x,y){
      if(!x) { throw new Error("Requires points"); }
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

return Selafin;

}));
