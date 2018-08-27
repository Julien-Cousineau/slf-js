'use strict';

const Bufferpack = require('./bufferpack');
const bufferpack = new Bufferpack();
const proj =require('./proj')
const { range } = require('@julien.cousineau/util')

/**
 * Create Selafin Object - opentelemac.org
 * @param {Buffer} buffer - Buffer containing binary information
 * @param {Object} options - Optional information
 * @returns {Object} Selafin - a Selafin object
 */
module.exports =  class Selafin{
  constructor(buffer,options){
  if(!options)options={};
  this.fromProj = options.fromProj || 'EPSG:4326';
  this.toProj = options.toProj || 'EPSG:4326';
  this.keepbuffer = options.keepbuffer || 0;
  this.debug = options.debug || 0;
  this.initialised(buffer);
  }

  initialised(buffer){
    let debug = this.debug;
    let keepbuffer = this.keepbuffer;
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
    if (!(keepbuffer)) this.uint8array = null;
    
    // ~~> transform xy mesh
    if (debug) console.time('Transform mesh XY');
    this.transform();
    if (debug) console.timeEnd('Transform mesh XY');
    
    // ~~> min/max values
    if (debug) console.time('Get min/max');
    this.minmax = this.getMinMax();
    if (debug) console.timeEnd('Get min/max');
    
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
    [l,this.NBV1,this.NBV2,chk] = bufferpack.unpack(endian+'iiii',uint8array,pos); //
    pos+=4+8+4;
    this.NVAR = this.NBV1 + this.NBV2;
    this.VARINDEX = range(this.NVAR,'Uint8Array');
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
    // this.IPOB3 = new Uint32Array(bufferpack.unpack(endian+this.NPOIN3+'i',uint8array,pos));
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
    let r = bufferpack.unpack(endian+nfloat+cfloat,uint8array,pos);
    pos +=ifloat*nfloat;
    let chk = bufferpack.unpack(endian+'i',uint8array,pos);
    pos +=4;
    if (l[0]!=chk[0]){
      throw Error('... Cannot read '+nfloat+' floats from your binary file +> Maybe it is the wrong file format ?');
    }
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
    return { 'cores':ATt,'times':ATs};
  }
/**
 * Get Frame
 * @param {Integer} frame - Frame id
 * @param {Integer | Array} indexes - Indexes of variables
 * @returns {Float32Array} z - NPOIN Float32Array
 */  
  getFrame(frame,indexes){
    if(!(this.uint8array)) throw Error("uint8array is null. Add keepbuffer=1 in options"); 
    frame = (typeof frame !== 'undefined') ?  frame : 0;
    if (!(frame >= 0 && frame < this.NFRAME)) throw Error("Check frame id"); 
    indexes = (typeof indexes !== 'undefined') ?  indexes : 0;
    indexes = (Number.isInteger(indexes)) ? [indexes]:indexes;
    indexes = (indexes.length == 0) ? range(this.NFRAME,'Uint16Array'):indexes;
    
 
    let uint8array =  this.uint8array;
    let endian = this.file.endian;    
    let [ftype,fsize] = this.file.float;
    
    // ~~> get frame
    if (this.debug) console.time('Get frame');
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
    if (this.debug) console.timeEnd('Get frame');
    return z;
  }
//   /**
// * Get Element Frame
// * @param {Integer} frame - Frame id
// * @param {Integer | Array} indexes - Indexes of variables
// * @returns {Float32Array} z - Float32Array
// */  
//   getELEMENTFRAME:function(frame,indexes){
//     if(!(this.uint8array)) throw Error("uint8array is null. Add keepbuffer=1 in options"); 
    
//     let debug = this.debug;
    
//     frame = (typeof frame !== 'undefined') ?  frame : 0;
//     if (!(frame >= 0 && frame < this.NFRAME)) throw Error("Check frame id"); 
//     indexes = (typeof indexes !== 'undefined') ?  indexes : 0;
//     indexes = (Number.isInteger(indexes)) ? [indexes]:indexes;
//     indexes = (indexes.length == 0) ? util.range(this.NFRAME,'16'):indexes;
    
//     // ~~> get element xy
//     if (debug) console.time('Get element frame');
//     let exy = this._TRIXY = new Float32Array(this.NELEM3*this.NDP3);
//     const values = this.getFrame(frame,indexes);
//     // console.log(values)
//     let n1,n2,n3;
//     for(let i=0,j=0,n=this.NELEM3;i<n;i++,j+=3){
//       n1 = this.IKLE3[i];
//       n2 = this.IKLE3[i+this.NELEM3];
//       n3 = this.IKLE3[i+2*this.NELEM3];
//       exy[j]   = values[n1];
//       exy[j+1] = values[n2];
//       exy[j+2] = values[n3];
//     }
//     if (debug) console.timeEnd('Get element frame');    
//     return exy;
//   },
  
  
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
  getElement(indexes){
    indexes = (Number.isInteger(indexes)) ? [indexes]:indexes;
    
    // ~~> get element
    if (this.debug) console.time('Get elements');    
    indexes = (typeof indexes !== 'undefined') ?  indexes : range(this.NELEM3,'Uint32Array');
    let elements = new Uint32Array(indexes.length*this.NDP3);
    for(let i=0,j=0,n=indexes.length;i<n;i++,j+=3){
      elements[j] = this.IKLE3[indexes[i]];
      elements[j+1] =this.IKLE3[indexes[i]+this.NELEM3];
      elements[j+2] =this.IKLE3[indexes[i]+2*this.NELEM3];
    }
    if (this.debug) console.timeEnd('Get elements');    
    return elements;
  }
  // getIndices:function(indexes){
  //   indexes = (Number.isInteger(indexes)) ? [indexes]:indexes;
    
  //   // ~~> get element
  //   if (this.debug) console.time('Get elements');    
  //   indexes = (typeof indexes !== 'undefined') ?  indexes : util.range(this.NELEM3,'32');
  //   let elements = new Uint32Array(indexes.length*this.NDP3);
  //   for(let i=0,j=0,n=indexes.length;i<n;i++,j+=3){
  //     elements[j]   = 3*indexes[i];
  //     elements[j+1] = 3*indexes[i]+1;
  //     elements[j+2] = 3*indexes[i]+2;
  //   }
  //   if (this.debug) console.timeEnd('Get elements');    
  //   return elements;
  // },
  reshapeIKLE(){
    let newIKLE = new Uint32Array(this.NELEM3*this.NDP3);
    for(let i=0,j=0;i<this.NELEM3;i++,j+=3){
      newIKLE[i] =  this.IKLE3[j];
      newIKLE[i+this.NELEM3] = this.IKLE3[j+1];
      newIKLE[i+2*this.NELEM3] = this.IKLE3[j+2];
    }
    return newIKLE;
  }
  changeProj(from,to){
    this.fromProj = from;
    this.toProj = to;
    if(from !== to){
      this.initializeProperties();
      this.transform();
    }
  }
  transform(){
    const fromProj = this.fromProj;
    const toProj = this.toProj;
    if(fromProj !== toProj){
      const transform = proj(fromProj,toProj);
      let coord;
      for(let i=0;i<this.NPOIN3;i++){
        coord=transform.forward([this.MESHX[i],this.MESHY[i]]);
        this.MESHX[i] = coord[0];
        this.MESHY[i] = coord[1];
      }
      this.fromProj = toProj;
    }
  }
  get TRIXY(){
    if (!(this._TRIXY)) this.getTriXY();
    return this._TRIXY;
  }
  get XY(){
    if (!(this._XY)) this.getXY();
    return this._XY;
  }
  get IKLEW(){
    if (!(this._IKLEW)) this.getIKLEW();
    return this._IKLEW;
  }
  get CX(){
    if(!(this._CX)) this.getTriCentroid();
    return this._CX;
  }
  get CY(){
    if (!(this._CY)) this.getTriCentroid();
    return this._CY;
  }
  get TRIAREA(){
    if (!(this._TRIAREA)) this.getTriArea();
    return this._TRIAREA;
  }
  get EXTENT(){
  if (!(this._EXTENT)) this._EXTENT= this.getExtent();
    return this._EXTENT;
  }
  getExtent(){
    return new Float32Array([this.MESHX.min(),this.MESHY.min(),this.MESHX.max(),this.MESHY.max()]);
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
    
    // ~~> get points
    if (this.debug) console.time('Get points xy');
    let xy = this._XY = new Float32Array(this.NPOIN3*3);
    for(let i=0,j=0,n=this.NPOIN3;i<n;i++,j+=3){
      xy[j] = this.MESHX[i];
      xy[j+1] = this.MESHY[i];
    }
    if (this.debug) console.timeEnd('Get points xy');    
  }
  getTriArea(){
    if (this.debug) console.time('Get element area');
    // Area was compute using cross-product
    let area = this._TRIAREA = new Float32Array(this.NELEM3);
    let n1,n2,n3;
    for(let i=0,n=this.NELEM3;i<n;i++){
      n1 = this.IKLE3[i];
      n2 = this.IKLE3[i+this.NELEM3];
      n3 = this.IKLE3[i+2*this.NELEM3];
      area[i] = 0.5 * ((this.MESHX[n2] - this.MESHX[n1]) * (this.MESHY[n3] - this.MESHY[n1]) - 
                       (this.MESHX[n3] - this.MESHX[n1]) * (this.MESHY[n2] - this.MESHY[n1])
                      );
    }
    if (this.debug) console.timeEnd('Get element area');
  }
  getTriCentroid(){
    if (this.debug) console.time('Get element centroid');
    // Centoid was compute using mean of X and Y
    let CX = this._CX = new Float32Array(this.NELEM3);
    let CY = this._CY = new Float32Array(this.NELEM3);
    let dummy = new Float32Array(1);
    dummy[0] = 3.0 ;
    let n1,n2,n3;
    for(let i=0,n=this.NELEM3;i<n;i++){
      n1 = this.IKLE3[i];
      n2 = this.IKLE3[i+this.NELEM3];
      n3 = this.IKLE3[i+2*this.NELEM3];
      CX[i] = (this.MESHX[n1] + this.MESHX[n2] + this.MESHX[n3]) / dummy[0];
      CY[i] = (this.MESHY[n1] + this.MESHY[n2] + this.MESHY[n3]) / dummy[0];
    }
    n1 = this.IKLE3[0];
    n2 = this.IKLE3[0+this.NELEM3];
    n3 = this.IKLE3[0+2*this.NELEM3];
    if (this.debug) console.timeEnd('Get element centroid');
  }
  
  //{STRING} title  
  addTITLE(title){
    this.TITLE = '{0}'.format(title.rpad(" ", 80));
  }

  //{OBJECT (name:str,unit:str)}
  addVAR(obj){
    if(!obj)obj={};
    const name = obj.name || 'NewVariable';
    const unit = obj.unit || 'NewUnit';
    this.NBV1 += 1
    this.NVAR = this.NBV1 + this.NBV2
    this.VARINDEX = range(this.NVAR)
    this.VARNAMES.push('{0}'.format(name.rpad(" ", 16))); 
    this.VARUNITS.push('{0}'.format(unit.rpad(" ", 16))); 
  }
  
  // [{x:0,y:0}]  
   addPOIN(points){
    if(!points) throw new Error("Requires points")
    this.IPOB2 = range(points.length)
    this.IPOB3 = this.IPOB2;
    this.IPARAM = new Uint8Array(10);
    this.IPARAM[0] = 1;
    this.NPOIN2 = points.length;
    this.NPOIN3 =this.NPOIN2;
    this.MESHX = points.map(row=>row.x);
    this.MESHY = points.map(row=>row.y);
   }
   
  //Uint32Array(NELEM3*NDP3
  addIKLE(ikle){
    this.NDP2 = 3
    this.NDP3 = 3
    this.NELEM2 = ikle.length
    this.NELEM3 = this.NELEM2
    this.IKLE2 = ikle
    this.IKLE3 = ikle 
  }

  printAttributes(){
    const attr = {
      'NFRAME':this.NFRAME,
      'NVAR':this.NVAR,
      'NPOIN3':this.NPOIN3,
      'NELEM3':this.NELEM3,
      'EXTENT':this.EXTENT,
    }
    console.log(attr)
  }
  
}


