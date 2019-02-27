import rbush from 'rbush';
import cover from '@mapbox/tile-cover';
import tilebelt from '@mapbox/tilebelt';
import bboxPolygon from '@turf/bbox-polygon';
import { range } from '@julien.cousineau/util';

import Selafin from './selafin.js';
export default class SelafinMP extends Selafin{
    constructor(buffer,options){
        options.toProj = 'EPSG:4326';
        super(buffer,options);
        this.tileLimits = options.tileLimits || {min_zoom: 1,max_zoom: 12};
        this.eLimit = options.eLimit || 50000;
        this.quadkey = '';
    }
    setQuadkey(quadkey){this.quadkey=quadkey;this._indices=null;this._indicesW=null;}
    get position(){return this.XY;}
    get indices() {if(!this._indices)this.getIndices();return this._indices;}
    get indicesW(){if(!this._indices)this.getIndices();return this._indicesW;}  
  
    get TILES(){
        if (!(this._TILES)) this.getTiles();
        return this._TILES;
    }    
    get KDTREE(){
        if (!(this._KDTREE))this.getKDTree();
        return this._KDTREE;    
    }
    getIndices(){
        let indices = this.TILES[this.quadkey];
        if(!indices)return null;
        if(typeof indices==='string')indices=this.TILES[indices];
        this._indices = this.getElements(indices);
        this._indicesW = this.getElementsW(indices);
    }
    getKDTree(){
        if (this.debug) console.time('Get kdtree');
        const tree = this._KDTREE = rbush();
        tree.load(this.TRIBBOX);
        if (this.debug) console.timeEnd('Get kdtree');
    }
    getTiles(){
        if (this.debug) console.time('Get tiles');
        const eLimit = this.eLimit;
        const {min_zoom,max_zoom} = this.tileLimits;
        const zooms = range(max_zoom-min_zoom).add(min_zoom); //TODO:change range in @julien.cousineau/util
        // const geometry = this.POLYGON.geometry;
        const geometry = bboxPolygon(this.EXTENT).geometry;
        const tiles =this._TILES= {};
        zooms.forEach(zoom=>{
            // if (this.debug) console.time(zoom);
            const quads = cover.indexes(geometry, {min_zoom:zoom,max_zoom:zoom});
            quads.forEach(quad=>{
                if(!quad)return;
                const tile = tilebelt.quadkeyToTile(quad);
                const parentquad = tilebelt.tileToQuadkey(tilebelt.getParent(tile));
        
                if(tiles[parentquad] && !Array.isArray(tiles[parentquad])){tiles[quad]=tiles[parentquad];
                } else if(tiles[parentquad] && Array.isArray(tiles[parentquad]) && tiles[parentquad].length<eLimit){tiles[quad]=parentquad;
                } else {
                    const bbox = tilebelt.tileToBBOX(tile);
                    const elements = this.KDTREE.search({minX: bbox[0],minY: bbox[1],maxX: bbox[2],maxY: bbox[3]});
                    const indices = elements.filter(e=>this.intersect(e.index,bbox)).map(e=>e.index);
                    if(indices.length==0)return tiles[quad]=parentquad;
                    if(indices < eLimit)return tiles[quad]=indices;
                    const sorted = indices.map(e=>[e,this.TRIAREA[e]]).sort((a,b)=>b[1]-a[1]).map(item=>item[0]);
                    tiles[quad]=sorted.slice(0,eLimit);
          
                }
            });
        });
        if (this.debug) console.timeEnd('Get tiles');
    }
    getTile(quadkey){
        return this.TILES[quadkey];
    }
    intersect(e,bbox){
        const n1 = this.IKLE3[e];
        const n2 = this.IKLE3[e+this.NELEM3];
        const n3 = this.IKLE3[e+2*this.NELEM3];
        const t_p1 = [this.MESHX[n1],this.MESHY[n1]];
        const t_p2 = [this.MESHX[n2],this.MESHY[n2]];
        const t_p3 = [this.MESHX[n3],this.MESHY[n3]];
        if(inBBox(t_p1,bbox))return true;
        if(inBBox(t_p2,bbox))return true;
        if(inBBox(t_p3,bbox))return true;
    
        const q_p1 = [bbox[0],bbox[1]];
        const q_p2 = [bbox[0],bbox[3]];
        const q_p3 = [bbox[2],bbox[3]];
        const q_p4 = [bbox[2],bbox[1]];
    
        const tri1 = [t_p1,t_p2];
        const tri2 = [t_p2,t_p3];
        const tri3 = [t_p3,t_p1];
  
        const quad1 = [q_p1,q_p2];
        const quad2 = [q_p2,q_p3];
        const quad3 = [q_p3,q_p4];
        const quad4 = [q_p4,q_p1];
    
        if(boolIntersects(tri1,quad1))return true;
        if(boolIntersects(tri1,quad2))return true;
        if(boolIntersects(tri1,quad3))return true;
        if(boolIntersects(tri1,quad4))return true;
    
        if(boolIntersects(tri2,quad1))return true;
        if(boolIntersects(tri2,quad2))return true;
        if(boolIntersects(tri2,quad3))return true;
        if(boolIntersects(tri2,quad4))return true;
    
        if(boolIntersects(tri3,quad1))return true;
        if(boolIntersects(tri3,quad2))return true;
        if(boolIntersects(tri3,quad3))return true;
        if(boolIntersects(tri3,quad4))return true;
    }  
}

// https://github.com/Turfjs/turf/blob/master/packages/turf-line-intersect/index.ts
function boolIntersects(coords1,coords2) {
    
  
    // if (coords1.length !== 2)throw new Error("<intersects> line1 must only contain 2 coordinates");
    // if (coords2.length !== 2)throw new Error("<intersects> line2 must only contain 2 coordinates");
    const x1 = coords1[0][0];
    const y1 = coords1[0][1];
    const x2 = coords1[1][0];
    const y2 = coords1[1][1];
    const x3 = coords2[0][0];
    const y3 = coords2[0][1];
    const x4 = coords2[1][0];
    const y4 = coords2[1][1];
    const denom = ((y4 - y3) * (x2 - x1)) - ((x4 - x3) * (y2 - y1));
    const numeA = ((x4 - x3) * (y1 - y3)) - ((y4 - y3) * (x1 - x3));
    const numeB = ((x2 - x1) * (y1 - y3)) - ((y2 - y1) * (x1 - x3));

    if (denom === 0) return null;
    
    const uA = numeA / denom;
    const uB = numeB / denom;

    if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1)return true;
    return null;
}
function inBBox(pt, bbox) {
    return bbox[0] <= pt[0] &&
        bbox[1] <= pt[1] &&
        bbox[2] >= pt[0] &&
        bbox[3] >= pt[1];
}
