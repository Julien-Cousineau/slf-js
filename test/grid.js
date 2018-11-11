// Create simple grid
export default function(options){
  options=options || {};
  const xmin = options.xmin || 0;
  const xmax = options.xmax || 10;
  const ymin = options.ymin || 0;
  const ymax = options.ymax || 10;
  const xstep = options.xstep || 1;
  const ystep = options.ystep || 1;
  
  const xlen = Math.ceil((xmax-xmin) / parseFloat(xstep)+1);
  const ylen = Math.ceil((ymax-ymin) / parseFloat(ystep)+1);
  const n = xlen*ylen;
  
  
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  
  let i=0;
  for(let _y=0;_y<ylen;_y++){
    for(let _x=0;_x<xlen;_x++){
      x[i]=(_x * parseFloat(xstep))+xmin;
      y[i]=(_y * parseFloat(ystep))+ymin;
      i+=1;
    }
  }
  
  let n1,n2,n3,n4,e=0;
  let ikle=new Uint32Array(((ylen-1)*(xlen-1))*2*3);
  for(let i=0;i<(ylen-1);i++){
    for(let j=0;j<(xlen-1);j++){
      n1=j+i*ylen;
      n2=(j+1)+i*ylen;
      n3=j+(i+1)*ylen;
      n4=(j+1)+(i+1)*ylen;
      ikle[e+0]=n1;
      ikle[e+1]=n3;
      ikle[e+2]=n2;
      ikle[e+3]=n2;
      ikle[e+4]=n3;
      ikle[e+5]=n4;
      e+=6;
    }
  }
  return [x,y,ikle];

}