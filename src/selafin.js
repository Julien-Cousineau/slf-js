// 'use strict';
import bufferpack from './bufferpack.js';
import { range } from './utils';
import {polygon as turf_polygon,featureCollection} from '@turf/helpers';
import area from '@turf/area';
import mask from '@turf/mask';

const RADIUS = 6378137;
const rad = function(num) {return num * Math.PI / 180.0;};

/**
 * Create Selafin Object - opentelemac.org
 * @param {Buffer} buffer - Buffer containing binary information
 * @param {Object} options - Optional information
 * @returns {Object} Selafin - a Selafin object
 */
export default class Selafin{
    constructor(buffer,options){
        if(!options)options={};
        this.debug = options.debug || false;
        this.keepframes = (typeof options.keepframes==='undefined')?true:options.keepframes;
        
        (buffer)?this.initialised(buffer):this.initialisedBlank();
    }
    initialisedBlank(){
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
    }
    initialised(buffer){
        let debug = this.debug;
        if (debug) console.time('Initialised selafin object');
    
        // ~~> Convert buffer to uint8array
        if (debug) console.time('Buffer to Uint8Array');
        this.uint8array = new Uint8Array(buffer);
        if (debug) console.timeEnd('Buffer to Uint8Array');
    
        // ~~> Initialised file object and check endian encoding
        this.file = {};
        this.file.endian = this.getEndianFromChar(80);
    
        // ~~> header parameters
        let pos=this.getHeaderMetaDataSLF();
    
        // ~~> connectivity
        if (debug) console.time('Get connectivity matrix');
        let posHeader=this.getHeaderIntegersSLF(pos);
        if (debug) console.timeEnd('Get connectivity matrix');
    
        // ~~> modify connectivity matrix : Change id to index 
        if (debug) console.time('Change connectivity matrix: id to index');
        this.IKLE3.add(-1);
        if (debug) console.timeEnd('Change connectivity matrix: id to index');
    
        // ~~> modify connectivity matrix : Reordering matrix
        if (debug) console.time('Reorder connectivity matrix');
        this.IKLE3F = this.IKLE3;
        this.IKLE3 = this.reshapeIKLE();
        if (debug) console.timeEnd('Reorder connectivity matrix');
    
        // ~~> checks float encoding
        this.file.float = this.getFloatTypeFromFloat(posHeader);
    
        // ~~> xy mesh
        if (debug) console.time('Get mesh XY');
        let posTS = this.getHeaderFloatsSLF(posHeader);
        if (debug) console.timeEnd('Get mesh XY');

        // ~~> frames
        if (debug) console.time('Get frame tags');
        this.tags =this.getTimeHistorySLF(posTS);
        if (debug) console.timeEnd('Get frame tags');
    
        // ~~> keeping buffer?
        // if (!(keepbuffer)) this.uint8array = null;
        if(this.keepframes)this.getFrames();
    
        // ~~> min/max values
        // if (debug) console.time('Get min/max');
        // this.minmax = this.getMinMax();
        // if (debug) console.timeEnd('Get min/max');
    
        this.initializeProperties();
    
        if (debug) {
            console.timeEnd('Initialised selafin object');
            console.log("NELEM:%d,NPOIN:%d,NFRAME:%d",this.NELEM3,this.NPOIN3,this.NFRAME);
        }
    }
    initializeProperties(){
    // ~~> initialize dynamic properties
        this._TRIXY = null;
        this._TRIAREA = null;
        this._CX = null;
        this._CY = null;
        this._EDGES = null;
        this._BEDGES = null;
        this._IEDGES = null;
    }
    getEndianFromChar(nchar){
        let uint8array =  this.uint8array;
        let endian = ">"; // "<" means little-endian, ">" means big-endian
        let l,c,chk;
        [l,c,chk] = bufferpack.unpack(endian+'i'+ nchar +'si',uint8array,0);
        if (chk!=nchar){
            endian = "<";
            [l,c,chk] = bufferpack.unpack(endian+'i'+ nchar +'si',uint8array,0);
        }
        if (l!=chk){
            throw Error('... Cannot read '+ nchar +' characters from your binary file +> Maybe it is the wrong file format ?');
        }
        return endian;
    }
    getHeaderMetaDataSLF(){
        let uint8array =  this.uint8array;
        let endian = this.file.endian;
        let l,chk;
        let pos=0;
        // ~~ Read title ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        [l,this.TITLE,chk] = bufferpack.unpack(endian+'i80si',uint8array,pos);
        pos+=4+80+4;
        // ~~ Read NBV(1) and NBV(2) ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        [l,this.NBV1,this.NBV2,chk] = bufferpack.unpack(endian+'iiii',uint8array,pos);
        pos+=4+8+4;
        this.NVAR = this.NBV1 + this.NBV2;
        this.VARINDEX = range(this.NVAR,'Uint8Array');
        // ~~ Read variable names and units ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        this.VARNAMES = []; this.VARUNITS = [];
        this.CLDNAMES = []; this.CLDUNITS = [];
        for(let i=0;i<this.NBV1;i++){
            let vn,vu;
            [l,vn,vu,chk] = bufferpack.unpack(endian+'i16s16si',uint8array,pos);
            pos+=4+16+16+4;
            this.VARNAMES.push(vn);
            this.VARUNITS.push(vu);
        }
        for(let i=0;i<this.NBV2;i++){
            let vn,vu;
            [l,vn,vu,chk] = bufferpack.unpack(endian+'i16s16si',uint8array,pos);
            pos+=4+16+16+4;
            this.CLDNAMES.push(vn);
            this.CLDUNITS.push(vu);      
        }

        // ~~ Read IPARAM array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        let d = bufferpack.unpack(endian+'12i',uint8array,pos);
        pos+=4+40+4;
        this.IPARAM = d.slice(1, 11);
        // ~~ Projection  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        this.PROJ = this.IPARAM[1];
        // ~~ Read DATE/TIME array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        this.DATETIME = new Uint16Array([1972,7,13,17,15,13]);
        if (this.IPARAM[9] == 1){
            d = bufferpack.unpack(endian+'8i',pos);
            pos+=4+24+4;
            this.DATETIME = d.slice(1, 9);
        }
        return pos;
    }
    getHeaderIntegersSLF(pos){
        let uint8array =  this.uint8array;
        let endian = this.file.endian;
        let l,chk;
    
        // ~~ Read NELEM3, NPOIN3, NDP3, NPLAN ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        [l,this.NELEM3,this.NPOIN3,this.NDP3,this.NPLAN,chk] = bufferpack.unpack(endian+'6i',uint8array,pos);
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
        } else {
            // WARNING - NOT SAVING IKLE2
            // this.IKLE2 = this.IKLE3
        }
        // ~~ Read the IPOBO array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        pos+=4;
        // WARNING - NOT SAVING IPOB3
        this.IPOB3 = new Uint32Array(bufferpack.unpack(endian+this.NPOIN3+'i',uint8array,pos));
        pos+=4*this.NPOIN3;
        pos+=4;
        // this.IPOB2 = this.IPOB3.slice(0,this.NPOIN2);
        return pos;
    }
    getFloatTypeFromFloat(pos){
    
        let uint8array =  this.uint8array;
        let endian = this.file.endian;
        let nfloat = this.NPOIN3;
        let ifloat = 4;
        let cfloat = 'f';
        let l = bufferpack.unpack(endian+'i',uint8array,pos);
        pos +=4;
    
        if (l[0]!=ifloat*nfloat){
            ifloat = 8;
            cfloat = 'd';
        }
        pos +=ifloat*nfloat;
        let chk = bufferpack.unpack(endian+'i',uint8array,pos);
        if (l[0]!=chk[0])throw Error('... Cannot read '+nfloat+' floats from your binary file +> Maybe it is the wrong file format ?');
        return [cfloat,ifloat];          
    }
    getHeaderFloatsSLF(pos){
        let uint8array =  this.uint8array;
        let endian = this.file.endian;
        let [ftype,fsize] = this.file.float;
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
    }
    getTimeHistorySLF(pos){
        let uint8array =  this.uint8array;
        let endian = this.file.endian;
        let [ftype,fsize] = this.file.float;

        let  ATs = [], ATt = [];
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
                ATt.pop(ATt.length-1);   // since the last record failed the try
                break;
            }
        }
        this.NFRAME = ATs.length;
        return { 'cores':ATt,'times':new Float32Array(ATs)};
    }
  
    writeHeaderSLF(){
        let endian = this.file.endian;    
        let [ftype,fsize] = this.file.float;
        let buffer = new Buffer(0);
        // ~~ Write title ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        buffer = Buffer.concat([buffer,bufferpack.pack(endian+'i80si',[80,this.TITLE,80])]);
        // ~~ Write NBV(1) and NBV(2) ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'iiii',[4+4,this.NBV1,this.NBV2,4+4])]);
        // ~~ Write variable names and units ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        for(let i=0;i<this.NBV1;i++){
            buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i16s16si',[32,this.VARNAMES[i],this.VARUNITS[i],32])]);
        }
        for(let i=0;i<this.NBV2;i++){
            buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i16s16si',[32,this.CLDNAMES[i],this.CLDUNITS[i],32])]);
        }    
        // ~~ Write IPARAM array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*10])]);
        for(let i=0;i<this.IPARAM.length;i++){
            buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[this.IPARAM[i]])]);
        }
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*10])]);
        // ~~ Write DATE/TIME array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if (this.IPARAM[9] == 1){
            buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*6])]);
            for(let i=0;i<6;i++){
                buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[this.DATETIME[i]])]);
            }
            buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*6])]);      
        }
    
        // ~~ Write NELEM3, NPOIN3, NDP3, NPLAN ~~~~~~~~~~~~~~~~~~~~~~~~~~~
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'6i',[4*4,this.NELEM3,this.NPOIN3,this.NDP3,1,4*4])]);  // /!\ TODO is NPLAN ?
        // ~~ Write the IKLE array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*this.NELEM3*this.NDP3])]);
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+`${this.NELEM3*this.NDP3}i`,this.IKLE3F.add(1))]); // TODO change IKLEF to IKLE ; index to id;
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*this.NELEM3*this.NDP3])]);
        // ~~ Write the IPOBO array ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*this.NPOIN3])]);
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+(this.NPOIN3+'i'),this.IPOB3)]);
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[4*this.NPOIN3])]);
        // ~~ Write the x-coordinates of the nodes ~~~~~~~~~~~~~~~~~~~~~~~
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
        //f.write(pack(endian+str(self.NPOIN3)+ftype,*(np.tile(self.MESHX,self.NPLAN))))
        for(let i=0;i<this.NPLAN;i++){
            buffer=Buffer.concat([buffer,bufferpack.pack(endian+(this.NPOIN2+ftype),this.MESHX)]);
        }
    
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
        // ~~ Write the y-coordinates of the nodes ~~~~~~~~~~~~~~~~~~~~~~~
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
        //f.write(pack(endian+str(self.NPOIN3)+ftype,*(np.tile(self.MESHX,self.NPLAN))))
        for(let i=0;i<this.NPLAN;i++){
            buffer=Buffer.concat([buffer,bufferpack.pack(endian+(this.NPOIN2+ftype),this.MESHY)]);
        }
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
        return buffer;
    }
    writeCoreTimeSLF(buffer,t){
        let endian = this.file.endian;    
        let [ftype,fsize] = this.file.float;
        // Print time record
        const _t =  (this.tags['times'].length==0 || !this.tags['times'][t])?t:this.tags['times'][t];
        buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i'+ftype+'i',[fsize,_t,fsize])]);
        return buffer;
    }
    writeCoreVarSLF(buffer,t){
        let endian = this.file.endian;    
        let [ftype,fsize] = this.file.float;    
        // Print variable records
        for(let i=0;i<this.NVAR;i++){
            const frame = this.getFrame(t,i);
            buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
            buffer=Buffer.concat([buffer,bufferpack.pack(endian+(this.NPOIN3+ftype),frame)]);
            buffer=Buffer.concat([buffer,bufferpack.pack(endian+'i',[fsize*this.NPOIN3])]);
        }
        return buffer;
    }
    getBuffer(){
        let buffer=this.writeHeaderSLF();
        for(let i=0;i<this.NFRAME;i++){
            buffer=this.writeCoreTimeSLF(buffer,i);
            buffer=this.writeCoreVarSLF(buffer,i);
        }
        return buffer;
    }
    getFrames(){
        let uint8array =  this.uint8array;
        let endian = this.file.endian;    
        let [ftype,fsize] = this.file.float;
        let frames = this.FRAMES = new Float32Array(this.NFRAME * this.NVAR * this.NPOIN3);
        for(let t=0;t<this.NFRAME;t++){
            let pos=this.tags['cores'][t];
            pos +=4+fsize+4;
            for(let ivar=0;ivar<this.NVAR;ivar++){
                pos +=4;
                frames.set(bufferpack.unpack(endian+(this.NPOIN3)+ftype,uint8array,pos),(t * this.NVAR * this.NPOIN3)+ivar*this.NPOIN3);
                pos +=fsize*this.NPOIN3;
                pos +=4;
            }
        }
    }
    
    getFrame(t,v){ 
        if(!this.FRAMES){
            console.warn("this.FRAMES is null. Add keepframes=true in options"); 
            return null;
        }
        if(typeof value !== 'number'){
            const {iFrame,vName,vIndex}=t;
            t=iFrame;
            v=vIndex||(vName &&this.getVarIndex(vName));
        }
        t = (typeof t !== 'undefined') ?  t : 0;
        v = (typeof v !== 'undefined') ?  v : 0;
        
        if (!(t >= 0 && t < this.NFRAME)) throw Error(`Check frame(${this.NFRAME}) id=${t} `); 
        if (!(v >= 0 && v < this.NVAR)) throw Error("Check variable id");
        return this.FRAMES.subarray((t * this.NVAR * this.NPOIN3)+(v * this.NPOIN3),(t * this.NVAR * this.NPOIN3)+(v * this.NPOIN3)+this.NPOIN3);
    }

    getMinMax(){
        let minmax = new Float32Array(this.NVAR * 2);
        for(let ivar=0;ivar<this.NVAR;ivar++){
            let max = Number.MIN_VALUE;
            let min = Number.MAX_VALUE;
            for(let i=0;i<this.NFRAME;i++){
                const values = this.getFrame(i);
                min = Math.min(min,values.min());
                max = Math.max(max,values.max());
            }
            minmax[ivar*2] = min;
            minmax[ivar*2+1] = max;
        }
        return minmax;
    }
    getVarMinMax(ivar){
        return this.minmax.subarray(ivar*2,ivar*2+1);
    }
    getElements(indices){
        if(!indices)return this.IKLE3F;
        if(!Number.isInteger(indices) && !Array.isArray(indices))return this.IKLE3F;
        indices = (Number.isInteger(indices)) ? [indices]:indices;
    
        // ~~> get element
        if (this.debug) console.time('Get elements');    
        let elements = new Uint32Array(indices.length*this.NDP3);
        for(let i=0,j=0,n=indices.length;i<n;i++,j+=3){
            elements[j+0] = this.IKLE3F[indices[i]];
            elements[j+1] = this.IKLE3F[indices[i]+1];
            elements[j+2] = this.IKLE3F[indices[i]+2];
        }
        if (this.debug) console.timeEnd('Get elements');    
        return elements;
    }
    getElementsW(indices){
        if(!indices)return this.IKLE3F;
        if(!Number.isInteger(indices) && !Array.isArray(indices))return this.IKLE3F;
        indices = (Number.isInteger(indices)) ? [indices]:indices;
    
        // ~~> get element
        if (this.debug) console.time('Get elementsW');    
        let elements = new Uint32Array(indices.length*this.NDP3*2);
        for(let i=0,j=0,k=0,n=indices.length;i<n;i++,j+=6,k+3){
            elements[j+0] = this.IKLE3F[indices[i]];
            elements[j+1] = this.IKLE3F[indices[i]+1];
            elements[j+2] = this.IKLE3F[indices[i]+1];
            elements[j+3] = this.IKLE3F[indices[i]+2];
            elements[j+4] = this.IKLE3F[indices[i]+2];
            elements[j+5] = this.IKLE3F[indices[i]];
        }
        if (this.debug) console.timeEnd('Get elementsW');    
        return elements;
    }
    reshapeIKLE(){
        let newIKLE = new Uint32Array(this.NELEM3*this.NDP3);
        for(let i=0,j=0;i<this.NELEM3;i++,j+=3){
            newIKLE[i] =  this.IKLE3[j];
            newIKLE[i+this.NELEM3] = this.IKLE3[j+1];
            newIKLE[i+2*this.NELEM3] = this.IKLE3[j+2];
        }
        return newIKLE;
    }
    get TRIXY(){
        if (!(this._TRIXY)) this.getTriXY();
        return this._TRIXY;
    }
    get varnames(){
        return this.VARNAMES.map(name=>name.replace(/\s/g, '').toLowerCase());
    }  
    getVarIndex(id){
        return this.varnames.findIndex(name=>name==id);
    }
    get wireframe(){
        const xy     = this.xy;  
        const edges  = this.EDGES;  
        const keys   = Object.keys(edges);
        const n      = keys.length;
        const source = new Float32Array(n*2);
        const target = new Float32Array(n*2);
        const edgeType = new Uint8Array(n);
        let key;
        for(let i= 0; i < n; i++){
            key = keys[i];
            const isInside=edges[key].e2?1:0;
            source.set(xy.subarray(edges[key].start*2,edges[key].start*2+2),i*2);
            target.set(xy.subarray(edges[key].end*2,edges[key].end*2+2),i*2);
            edgeType.set([isInside],i);
        }
        return {source,target,edgeType};
    }
    get xy(){return this.XY;}
    get elem(){return this.IKLE3F;}
    get npoin(){return this.NPOIN3;}
    get XY(){
        if (!(this._XY)) this.getXY();
        return this._XY;
    }
    get IKLEW(){
        if (!(this._IKLEW)) this.getIKLEW();
        return this._IKLEW;
    }
    get EDGES(){
        if (!(this._EDGES)) this.getEDGES();
        return this._EDGES;
    }
    get BEDGES(){
        if (!(this._BEDGES)) this.getBEDGES();
        return this._BEDGES;
    }
    get IEDGES(){
        if (!(this._IEDGES)) this.getIEDGES();
        return this._IEDGES;
    }
    get CX(){
        if(!(this._CX)) this.getTriAttributes();
        return this._CX;
    }
    get CY(){
        if (!(this._CY)) this.getTriAttributes();
        return this._CY;
    }
    get TRIAREA(){
        if (!(this._TRIAREA)) this.getTriAttributes();
        return this._TRIAREA;
    }
    get TRIBBOX(){
        if (!(this._TRIBBOX)) this.getTriAttributes();
        return this._TRIBBOX;
    }
    get BBOX(){
        return this.EXTENT;
    }
    get EXTENT(){
        if (!(this._EXTENT))this.getExtent();
        return this._EXTENT;
    }
    get POLYGON(){
        if (!(this._POLYGON))this.getPolygon();
        return this._POLYGON;
    }
    get EXTERIOR(){
        if (!(this._EXTERIOR))this.getExtInt();
        return this._EXTERIOR;
    }
    get INTERIORS(){
        if (!(this._INTERIORS))this.getExtInt();
        return this._INTERIORS;
    }  
    get POLYGONS(){ 
        if (!(this._POLYGONS))this.getPolygons();
        return this._POLYGONS;
    }
    getExtent(){
        if (this.debug) console.time('Get extent');
        this._EXTENT=new Float32Array([this.MESHX.min(),this.MESHY.min(),this.MESHX.max(),this.MESHY.max()]);
        if (this.debug) console.timeEnd('Get extent');
    }
    getExtInt(){
        if (this.debug) console.time('Get exterior/interiors');
        const polygons = this.POLYGONS;
        const areas = polygons.map(pol=>area(pol));
        const interiors = this._INTERIORS = areas.sortIndices(true).map(i=>polygons[i]);
        this._EXTERIOR= interiors.shift();
        if (this.debug) console.timeEnd('Get exterior/interiors');
    }
    getCoordinate(i){
        return [this.MESHX[i],this.MESHY[i]];
    }
    getPolygon(){
        if (this.debug) console.time('Get polygon');
        if(this.INTERIORS.length==0){this._POLYGON =this.EXTERIOR;}
        else{this._POLYGON = mask(featureCollection(this.INTERIORS),this.EXTERIOR);}
        if (this.debug) console.timeEnd('Get polygon');
    }
    getPolygons(){
        // ~~> get outlines (boundary edges)/polygons
        if (this.debug) console.time('Get polygons');
        const bedges=this.BEDGES;
        const pols =this._POLYGONS= [];
        let index,start,end=-1,pol=[];
        while(bedges.length>0){
            index=bedges.findIndex(item=>item.start==end || item.end==end);
            if(index==-1){
                if(pol.length>0){pols.push(turf_polygon([pol]));pol=[];}
                start=bedges[0].start;
                end=bedges[0].end;
                pol.push(this.getCoordinate(start));
                pol.push(this.getCoordinate(end));
                bedges.splice(0,1);
            } else {
                end=(bedges[index].start==end)?bedges[index].end:bedges[index].start;
                pol.push(this.getCoordinate(end));
                bedges.splice(index,1);
                if(bedges.length==0 && pol.length>0)pols.push(turf_polygon([pol]));
            }
        }
        if (this.debug) console.timeEnd('Get polygons');
    }
    getIKLEW(){
        if (this.debug) console.time('Get connectivity for wireframe');
        let IKLEW = this._IKLEW = new Uint32Array(this.NELEM3*this.NDP3*2);
        for(let i=0,j=0,k=0;i<this.NELEM3;i++,j+=6,k+=3){
            IKLEW[j] =  this.IKLE3F[k];
            IKLEW[j+1] = this.IKLE3F[k+1];
            IKLEW[j+2] = this.IKLE3F[k+1];
            IKLEW[j+3] = this.IKLE3F[k+2];
            IKLEW[j+4] = this.IKLE3F[k+2];
            IKLEW[j+5] = this.IKLE3F[k];
        }
        if (this.debug) console.timeEnd('Get connectivity for wireframe');
    }
    getTriXY(){
    // ~~> get element xy
        if (this.debug) console.time('Get element xy');
        let exy = this._TRIXY = new Float32Array(this.NELEM3*this.NDP3*3);
        let n1,n2,n3;
        for(let i=0,j=0,n=this.NELEM3;i<n;i++,j+=9){
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
        if (this.debug) console.timeEnd('Get element xy');
    }
    getXY(){
        // ~~> get points (x,y)
        if (this.debug) console.time('Get points xy');
        let xy = this._XY = new Float32Array(this.NPOIN3*2);
        for(let i=0,j=0,n=this.NPOIN3;i<n;i++,j+=2){
            xy[j] = this.MESHX[i];
            xy[j+1] = this.MESHY[i];
            // xy[j+2] = this.MESHZ[i];
        }
        if (this.debug) console.timeEnd('Get points xy');
    }
    getBEDGES(){
        // ~~> get exterior edges
        if (this.debug) console.time('Get boundary edges');
        const edges = this.EDGES;
        this._BEDGES = Object.keys(edges).filter(key=>!edges[key].boundary).map(key=>edges[key]);
        if (this.debug) console.timeEnd('Get boundary edges');
    }
    getIEDGES(){
        // ~~> get interior edges
        if (this.debug) console.time('Get interior edges');
        const edges = this.EDGES;
        this._IEDGES = Object.keys(edges).filter(key=>edges[key].boundary).map(key=>edges[key]);
        if (this.debug) console.timeEnd('Get interior edges');
    }  
    getEDGES(){
        // ~~> get edges
        if (this.debug) console.time('Get edges');
        const edges = this._EDGES = {};
        let n1,n2,n3,_n1,_n2,_n3;
        for (let  e = 0; e < this.NELEM3; e++ )
        {
            n1 = this.IKLE3[e];
            n2 = this.IKLE3[e+this.NELEM3];
            n3 = this.IKLE3[e+2*this.NELEM3];
      
            _n1 = `${Math.min(n1,n2)}-${Math.max(n1,n2)}`;
            _n2 = `${Math.min(n2,n3)}-${Math.max(n2,n3)}`;
            _n3 = `${Math.min(n3,n1)}-${Math.max(n3,n1)}`;
            
            (typeof edges[_n1]!=='undefined')?edges[_n1].boundary=true:edges[_n1]={boundary:false,start:Math.min(n1,n2),end:Math.max(n1,n2)}; 
            (typeof edges[_n2]!=='undefined')?edges[_n2].boundary=true:edges[_n2]={boundary:false,start:Math.min(n2,n3),end:Math.max(n2,n3)};
            (typeof edges[_n3]!=='undefined')?edges[_n3].boundary=true:edges[_n3]={boundary:false,start:Math.min(n3,n1),end:Math.max(n3,n1)};
        }
        if (this.debug) console.timeEnd('Get edges');
    }
    getTriAttributes(){
        if (this.debug) console.time('Get element attributes');
        // Centroid is computed using mean of X and Y
        // Area is computed using cross-product
        let CX = this._CX = new Float32Array(this.NELEM3);
        let CY = this._CY = new Float32Array(this.NELEM3);    
        let area = this._TRIAREA = new Float32Array(this.NELEM3);
        let bbox = this._TRIBBOX = new Array(this.NELEM3);
        let n1,n2,n3;
        for(let i=0,n=this.NELEM3;i<n;i++){
            n1 = this.IKLE3[i];
            n2 = this.IKLE3[i+this.NELEM3];
            n3 = this.IKLE3[i+2*this.NELEM3];
      
            CX[i]   = (this.MESHX[n1] + this.MESHX[n2] + this.MESHX[n3]) / 3.0;
            CY[i]   = (this.MESHY[n1] + this.MESHY[n2] + this.MESHY[n3]) / 3.0;      
            bbox[i] = {
                minX:Math.min(this.MESHX[n1],Math.min(this.MESHX[n2],this.MESHX[n3])),
                minY:Math.min(this.MESHY[n1],Math.min(this.MESHY[n2],this.MESHY[n3])),
                maxX:Math.max(this.MESHX[n1],Math.max(this.MESHX[n2],this.MESHX[n3])),
                maxY:Math.max(this.MESHY[n1],Math.max(this.MESHY[n2],this.MESHY[n3])),
                index:i
            };
            // TODO : Assume cartesian coordinate system. 
            //        If using lat/long, areas might be misleading for large elements (several kilometers).
            //        I'm not sure if there's an easy solution. I've seen ajustment for different latitudes (mourne wind map)
            // area[i] = Math.abs(0.5 * ((this.MESHX[n2] - this.MESHX[n1]) * (this.MESHY[n3] - this.MESHY[n1]) - 
            //           (this.MESHX[n3] - this.MESHX[n1]) * (this.MESHY[n2] - this.MESHY[n1])
            // ));
            // https://github.com/Turfjs/turf/tree/master/packages/turf-area
            const points = [
                [this.MESHX[n1],this.MESHY[n1]],
                [this.MESHX[n2],this.MESHY[n2]],
                [this.MESHX[n3],this.MESHY[n3]]
            ];
            let total = 0.0;
            total += (rad(points[2][0]) - rad(points[0][0])) * Math.sin(rad(points[1][1]));
            total += (rad(points[1][0]) - rad(points[2][0])) * Math.sin(rad(points[0][1]));
            total += (rad(points[0][0]) - rad(points[1][0])) * Math.sin(rad(points[2][1]));
            area[i] = total * RADIUS * RADIUS * 0.5;
            
            
        }
        if (this.debug) console.timeEnd('Get element attributes');
    }
  
    //{STRING} title  
    addTITLE(title){
        this.TITLE = `${title.rpad(" ", 80)}`;
    }

    //{OBJECT (name:str,unit:str)}
    addVAR(obj){
        if(!obj)obj={};
        const name = obj.name || 'NewVariable';
        const unit = obj.unit || 'NewUnit';
        this.NBV1 += 1;
        this.NVAR = this.NBV1 + this.NBV2;
        this.VARINDEX = range(this.NVAR);
        this.VARNAMES.push(`${name.rpad(" ", 16)}`); 
        this.VARUNITS.push(`${unit.rpad(" ", 16)}`); 
    }
  
   
    addPOINTS(x,y){
        if(!x) throw new Error("Requires points");
        this.IPOB3 = new Uint32Array(x.length).range();
        this.IPOB2 = this.IPOB3;
        this.IPARAM = new Uint8Array(10);
        this.IPARAM[0] = 1;
        this.NPOIN2 = x.length;
        this.NPOIN3 =this.NPOIN2;
        (y)?this._addXY(x,y):this._addPoints(x);
    }
    _addXY(x,y){
        this.MESHX=x;
        this.MESHY=y;
    }
    _addPoints(points){
        this.MESHX = new Float32Array(this.NPOIN3);
        this.MESHY = new Float32Array(this.NPOIN3);
    
        for(let i=0;i<this.NPOIN3;i++){
            this.MESHX[i]=points[i].x;
            this.MESHY[i]=points[i].y;
        }
    }
   
    //Uint32Array(NELEM3*NDP3)
    addIKLE(ikle){
        this.NDP2 = 3;
        this.NDP3 = 3;
        this.NELEM3 = ikle.length / this.NDP3;
        this.NELEM2 = this.NELEM3;
        this.IKLE2 = ikle;
        this.IKLE3 = ikle; 
    
        this.IKLE3F = this.IKLE3;
        this.IKLE3 = this.reshapeIKLE();
    }
    addFrame(array){
        if(array.length !=this.NVAR * this.NPOIN3)throw new Error("Wrong array size");
        this.NFRAME +=1;
        if(!this.FRAMES)return this.FRAMES=array;
        const oldFrames = this.FRAMES;
        this.FRAMES = new Float32Array(this.NFRAME * this.NVAR * this.NPOIN3);
        this.FRAMES.set(oldFrames,0);
        this.FRAMES.set(array,(this.NFRAME-1) * this.NVAR * this.NPOIN3);
    }  
    // {STRING} title
    // {OBJECT (name:str,unit:str)} var
    // {2D Array}
    // {2D Array(NELEM,3}
    addMesh(title,variable,points,ikle){
        this.empty = false;
        this.addTITLE(title);
        this.addVAR(variable);
        this.addPOINTS(points);
        this.addIKLE(ikle);
    }
    // {String}
    // writeSLF(self,output){
    //   // this.appendHeaderSLF()
    //   // // ~~> Time stepping
    //   // self.tags['times']=np.arange(self.values.shape[0])
    //   // for t in range(self.NFRAME):
    //   //     self.appendCoreTimeSLF(t)
    //   //     self.appendCoreVarsSLF(self.values[t])
    //   // self.fole['hook'].close()  
    // }
    printAttributes(){
        const attr = {
            'NFRAME':this.NFRAME,
            'NVAR':this.NVAR,
            'NPOIN3':this.NPOIN3,
            'NELEM3':this.NELEM3,
            'EXTENT':this.EXTENT,
        };
        console.log(attr);
    }
}