'use strict';

const bufferpack = require('./bufferpack');
const util = require('./util');

/**
 * Create Selafin Object - opentelemac.org
 * @param {Buffer} buffer - Buffer containing binary information
 * @param {Object} options - Optional information
 * @returns {Object} Selafin - a Selafin object
 */
function Selafin(buffer,options){
  options = this.options = extend(Object.create(this.options), options);
  this.initialised(buffer);

}

Selafin.prototype = {
    options: {
    keepbuffer: 0,          // kepp buffer in memory
    debug: 0                // logging level (0, 1 or 2)
  },

  initialised:function(buffer){
    let debug = this.options.debug;
    let keepbuffer = this.options.keepbuffer;
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
    
    if (debug) console.time('Get frame tags');
    this.minmax = this.getMinMax();
    if (debug) console.timeEnd('Get frame tags');
    // ~~> keeping buffer?
    if (!(keepbuffer)) this.uint8array = null;
    
    // ~~> initialize dynamic properties
    this._ELEMENTXY = null;
    this._ELEMENTAREA = null;
    this._CX = null;
    this._CY = null;
    
    if (debug) {
      console.timeEnd('Initialised selafin object');
      console.log("NELEM:%d,NPOIN:%d,NFRAME:%d",this.NELEM3,this.NPOIN3,this.NFRAME);
    }
  },
  getEndianFromChar:function(nchar){
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
  },
  getHeaderMetaDataSLF:function(){
    let uint8array =  this.uint8array;
    let endian = this.file.endian;
    let l,chk;
    let pos=0;
    // ~~ Read title ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    [l,this.TITLE,chk] = bufferpack.unpack(endian+'i80si',uint8array,pos);
    pos+=4+80+4;
    // ~~ Read NBV(1) and NBV(2) ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    [l,this.NBV1,this.NBV2,chk] = bufferpack.unpack(endian+'iiii',uint8array,pos); //
    pos+=4+8+4;
    this.NVAR = this.NBV1 + this.NBV2;
    this.VARINDEX = util.range(this.NVAR,'8');
    // ~~ Read variable names and units ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    this.VARNAMES = []; this.VARUNITS = [];
    for(let i=0;i<this.NBV1;i++){
      let vn,vu;
      [l,vn,vu,chk] = bufferpack.unpack(endian+'i16s16si',uint8array,pos);
      pos+=4+16+16+4;
      this.VARNAMES.push(vn);
      this.VARUNITS.push(vu);
      this.CLDNAMES = []; this.CLDUNITS = [];
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
  },
  getHeaderIntegersSLF:function(pos){
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
    // this.IPOB3 = new Uint32Array(bufferpack.unpack(endian+this.NPOIN3+'i',uint8array,pos));
    pos+=4*this.NPOIN3;
    pos+=4;
    // this.IPOB2 = this.IPOB3.slice(0,this.NPOIN2);
    return pos;
  },
  getFloatTypeFromFloat:function(pos){
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
    let r = bufferpack.unpack(endian+nfloat+cfloat,uint8array,pos);
    pos +=ifloat*nfloat;
    let chk = bufferpack.unpack(endian+'i',uint8array,pos);
    pos +=4;
    if (l[0]!=chk[0]){
      throw Error('... Cannot read '+nfloat+' floats from your binary file +> Maybe it is the wrong file format ?');
    }
    return [cfloat,ifloat];          
  },
  getHeaderFloatsSLF:function(pos){
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
  },
  getTimeHistorySLF:function(pos){
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
    return { 'cores':ATt,'times':ATs};
  },
/**
 * Get Frame
 * @param {Integer} frame - Frame id
 * @param {Integer | Array} indexes - Indexes of variables
 * @returns {Float32Array} z - NPOIN Float32Array
 */  
  getFrame:function(frame,indexes){
    if(!(this.uint8array)) throw Error("uint8array is null. Add keepbuffer=1 in options"); 
    frame = (typeof frame !== 'undefined') ?  frame : 0;
    if (!(frame >= 0 && frame < this.NFRAME)) throw Error("Check frame id"); 
    indexes = (typeof indexes !== 'undefined') ?  indexes : 0;
    indexes = (Number.isInteger(indexes)) ? [indexes]:indexes;
    indexes = (indexes.length == 0) ? util.range(this.NFRAME,'16'):indexes;
    
    let debug = this.options.debug;
    let uint8array =  this.uint8array;
    let endian = this.file.endian;    
    let [ftype,fsize] = this.file.float;
    
    // ~~> get frame
    if (debug) console.time('Get frame');
    let z = new Float32Array(indexes.length * this.NPOIN3);
    
    let pos=this.tags['cores'][frame];
    pos +=4+fsize+4;
    for(let ivar=0,iindexes=0;ivar<this.NVAR;ivar++){
      pos +=4;
      let index =indexes.indexOf(ivar);
      if(index!==-1){
        z.set(bufferpack.unpack(endian+(this.NPOIN3)+ftype,uint8array,pos),iindexes++ *this.NPOIN3);
      } 
      pos +=fsize*this.NPOIN3;
      pos +=4;
    }
    if (debug) console.timeEnd('Get frame');
    return z;
  },
  /**
 * Get Element Frame
 * @param {Integer} frame - Frame id
 * @param {Integer | Array} indexes - Indexes of variables
 * @returns {Float32Array} z - Float32Array
 */  
  getELEMENTFRAME:function(frame,indexes){
    if(!(this.uint8array)) throw Error("uint8array is null. Add keepbuffer=1 in options"); 
    
    let debug = this.options.debug;  
    
    frame = (typeof frame !== 'undefined') ?  frame : 0;
    if (!(frame >= 0 && frame < this.NFRAME)) throw Error("Check frame id"); 
    indexes = (typeof indexes !== 'undefined') ?  indexes : 0;
    indexes = (Number.isInteger(indexes)) ? [indexes]:indexes;
    indexes = (indexes.length == 0) ? util.range(this.NFRAME,'16'):indexes;
    
    // ~~> get element xy
    if (debug) console.time('Get element frame');
    let exy = this._ELEMENTXY = new Float32Array(this.NELEM3*this.NDP3);
    const values = this.getFrame(frame,indexes);
    let n1,n2,n3;
    for(let i=0,j=0,n=this.NELEM3;i<n;i++,j+=3){
      n1 = this.IKLE3[i];
      n2 = this.IKLE3[i+this.NELEM3];
      n3 = this.IKLE3[i+2*this.NELEM3];
      exy[j]   = values[n1];
      exy[j+1] = values[n2];
      exy[j+2] = values[n3];
    }
    if (debug) console.timeEnd('Get element frame');    
    return exy;
  },
  getMinMax:function(){
    let max = Number.MIN_VALUE;
    let min = Number.MAX_VALUE;
    for(let i=0;i<this.NFRAME;i++){
      const values = this.getFrame(i);
      min = Math.min(min,values.min());
      max = Math.max(max,values.max());
    }
    return new Float32Array([min,max]);
  },
  get ELEMENTXY(){
    if(this._ELEMENTXY) return this._ELEMENTXY;
    let debug = this.options.debug;
    
    // ~~> get element xy
    if (debug) console.time('Get element xy');
    let exy = this._ELEMENTXY = new Float32Array(this.NELEM3*this.NDP3*3);
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
    if (debug) console.timeEnd('Get element xy');
    return this._ELEMENTXY;
  },
  getElement:function(indexes){
    indexes = (Number.isInteger(indexes)) ? [indexes]:indexes;
    
    // ~~> get element
    if (this.options.debug) console.time('Get elements');    
    indexes = (typeof indexes !== 'undefined') ?  indexes : util.range(this.NELEM3,'32');
    let elements = new Uint32Array(indexes.length*this.NDP3);
    for(let i=0,j=0,n=indexes.length;i<n;i++,j+=3){
      elements[j] = this.IKLE3[indexes[i]];
      elements[j+1] =this.IKLE3[indexes[i]+this.NELEM3];
      elements[j+2] =this.IKLE3[indexes[i]+2*this.NELEM3];
    }
    if (this.options.debug) console.timeEnd('Get elements');    
    return elements;
  },
  getIndices:function(indexes){
    indexes = (Number.isInteger(indexes)) ? [indexes]:indexes;
    
    // ~~> get element
    if (this.options.debug) console.time('Get elements');    
    indexes = (typeof indexes !== 'undefined') ?  indexes : util.range(this.NELEM3,'32');
    let elements = new Uint32Array(indexes.length*this.NDP3);
    for(let i=0,j=0,n=indexes.length;i<n;i++,j+=3){
      elements[j]   = 3*indexes[i];
      elements[j+1] = 3*indexes[i]+1;
      elements[j+2] = 3*indexes[i]+2;
    }
    if (this.options.debug) console.timeEnd('Get elements');    
    return elements;
  },
  reshapeIKLE:function(){
    let newIKLE = new Uint32Array(this.NELEM3*this.NDP3);
    for(let i=0,j=0;i<this.NELEM3;i++,j+=3){
      newIKLE[i] =  this.IKLE3[j];
      newIKLE[i+this.NELEM3] = this.IKLE3[j+1];
      newIKLE[i+2*this.NELEM3] = this.IKLE3[j+2];
    }
    return newIKLE;
  },
  get ELEMENTAREA(){
    if(this._ELEMENTAREA) return this._ELEMENTAREA;
    
    if (this.options.debug) console.time('Get element area');
    // Area was compute using cross-product
    let area = this._ELEMENTAREA = new Float32Array(this.NELEM3);
    let n1,n2,n3;
    for(let i=0,n=this.NELEM3;i<n;i++){
      n1 = this.IKLE3[i];
      n2 = this.IKLE3[i+this.NELEM3];
      n3 = this.IKLE3[i+2*this.NELEM3];
      area[i] = 0.5 * ((this.MESHX[n2] - this.MESHX[n1]) * (this.MESHY[n3] - this.MESHY[n1]) - 
                       (this.MESHX[n3] - this.MESHX[n1]) * (this.MESHY[n2] - this.MESHY[n1])
                      );
    }
    if (this.options.debug) console.timeEnd('Get element area');
    return this._ELEMENTAREA;
  },
  get CX(){
    if(this._CX) return this._CX;
    
    this.getElementCentroid();
    return this._CX;
  },
  get CY(){
    if(this._CY) return this._CY;
    this.getElementCentroid();
    return this._CY;
  },  
  getElementCentroid:function(){
    if (this.options.debug) console.time('Get element centroid');
    // Centoid was compute using mean of X and Y
    let CX = this._CX = new Float32Array(this.NELEM3);
    let CY = this._CY = new Float32Array(this.NELEM3);
    let n1,n2,n3;
    for(let i=0,n=this.NELEM3;i<n;i++){
      n1 = this.IKLE3[i];
      n2 = this.IKLE3[i+this.NELEM3];
      n3 = this.IKLE3[i+2*this.NELEM3];
      CX[i] = (this.MESHX[n1] + this.MESHX[n2] + this.MESHX[n3]) / 3.0;
      CY[i] = (this.MESHY[n1] + this.MESHY[n2] + this.MESHY[n3]) / 3.0;
    }
    if (this.options.debug) console.timeEnd('Get element centroid');
  },  
};

Uint32Array.prototype.add = function(value){
  for(let i=0,n=this.length;i<n;i++){
    this[i]+=value;
  }
};

function extend(dest, src) {
    for (var i in src) dest[i] = src[i];
    return dest;
}


module.exports = Selafin;