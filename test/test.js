import t from 'tape';
import fs from 'fs';
import turf_area from '@turf/area';
import {polygon as turf_polygon,featureCollection} from '@turf/helpers';
// const fs = require('fs');

// const Selafin =require('../src');
import {Selafin,
// SelafinGL,
    SelafinMP} from '../src';

const values = require('../data/demo1.js');

import grid from './grid.js';

var polygon = turf_polygon([[[-1, -1], [-1, -0.9], [-0.9, -1], [-1, -1]]]);
var area = new Float32Array([turf_area(polygon)]);
console.log(area)


t('Testing Selafin', function (t) {
    const filename_0 = './data/demo1.slf';
    fs.readFile(filename_0,  function(err, buffer) {
        if(err){throw Error(err);}
        let slf = new SelafinMP(buffer,{keepframes:true,debug:1});
        t.same(values.NELEM3,slf.NELEM3);
        t.same(values.NPOIN3,slf.NPOIN3);
        t.same(values.NFRAME,slf.NFRAME);
        t.same(values.MESHX.compare(slf.MESHX),true);
        t.same(values.MESHY.compare(slf.MESHY),true);
        t.same(values.ELEMENTS,slf.getElements());
        t.same(values.TRIXY.compare(slf.TRIXY),true);
        // console.log(slf.TRIBBOX)
        console.log(slf.TRIAREA);
        // t.same(values.XY.compare(slf.XY),true);
        // t.same(values.IKLEW.compare(slf.IKLEW),true);
        // t.same(values.IKLEW.compare(slf.IKLEW),true);
        // t.same(values.TRIAREA.compare(slf.TRIAREA),true);
        // t.same(values.TRIBBOX.compare(slf.TRIBBOX),true);
        // console.log(slf.TILES)
        // TODO test TRIBBOX
        t.same(values.CX.compare(slf.CX),true);
        t.same(values.CY.compare(slf.CY),true);
        t.same(values.EXTENT.compare(slf.EXTENT),true);
        t.same(values.POLYGONS.compare(slf.POLYGONS),true);
        
        
        t.end();    
    });
  
});

// t('Testing Selafin - Writting Single Frame/Variable', async function (t) {
//   const filename = './data/testingslf.single.slf';
  
//   const slf = new Selafin();
//   const [x,y,ikle]=grid();
//   slf.addTITLE("Grid - Test1");
//   slf.addVAR({'name':'BOTTOM','unit':'m'});
//   slf.addPOINTS(x,y);
//   slf.addIKLE(ikle);
//   const frame1=new Float32Array(slf.NVAR * slf.NPOIN3);
//   for(let i=0;i<frame1.length;i++)frame1[i]= parseFloat(i) / frame1.length;
//   slf.addFrame(frame1);
//   await fs.writeFileSync(filename,slf.getBuffer());
  
//   const buffer = await fs.readFileSync(filename);
//   let slf2 = new Selafin(buffer,{keepframes:true,debug:0});
  
//   t.equal(slf.NPOIN3,slf2.NPOIN3);
//   t.equal(slf.NFRAME,slf2.NFRAME);
//   t.deepEqual(slf.MESHX,slf2.MESHX);
//   t.deepEqual(slf.MESHY,slf2.MESHY);
//   t.deepEqual(slf.IKLE,slf2.IKLE);
//   t.deepEqual(slf.FRAMES,slf2.FRAMES);
  
//   t.end();
// });

// t('Testing Selafin - Writting Multiple Frame/Variable', async function (t) {
//   const filename = './data/testingslf.multiple.slf';
  
//   const slf = new Selafin();
//   const [x,y,ikle]=grid();
//   slf.addTITLE("Grid - Test2");
//   slf.addVAR({'name':'BOTTOM','unit':'m'});
//   slf.addVAR({'name':'BED','unit':'m'});
//   slf.addPOINTS(x,y);
//   slf.addIKLE(ikle);
//   const frame1=new Float32Array(slf.NVAR * slf.NPOIN3);
//   for(let i=0;i<frame1.length;i++)frame1[i]= parseFloat(i) / frame1.length;
//   const frame2=new Float32Array(slf.NVAR * slf.NPOIN3);
//   for(let i=0;i<frame2.length;i++)frame2[i]= parseFloat(i);  
//   slf.addFrame(frame1);
//   slf.addFrame(frame2);
//   await fs.writeFileSync(filename,slf.getBuffer());
  
//   const buffer = await fs.readFileSync(filename);
//   let slf2 = new Selafin(buffer,{keepframes:true,debug:0});
  
//   t.equal(slf.NPOIN3,slf2.NPOIN3);
//   t.equal(slf.NFRAME,slf2.NFRAME);
//   t.deepEqual(slf.MESHX,slf2.MESHX);
//   t.deepEqual(slf.MESHY,slf2.MESHY);
//   t.deepEqual(slf.IKLE,slf2.IKLE);
//   t.deepEqual(slf.FRAMES,slf2.FRAMES);
  
//   t.end();
// });

// const slf = new SelafinMP(null,{keepframes:true,debug:1});
// const [x,y,ikle]=grid({xmin:-10,ymin:-10,xmax:10,ymax:10,xstep:0.05,ystep:0.05});
// slf.addTITLE("Grid - Test2");
// slf.addVAR({'name':'BOTTOM','unit':'m'});
// slf.addPOINTS(x,y);
// slf.addIKLE(ikle);
// const frame1=new Float32Array(slf.NVAR * slf.NPOIN3);
// for(let i=0;i<frame1.length;i++)frame1[i]= parseFloat(i) / frame1.length;
// slf.addFrame(frame1);
  
// slf.TILES;
  
// console.log(slf.getTile('3'));
memoryUsage();

t('Testing SelafinMP', async function (t) {
    // const filename = './data/testingslf.multiple.slf';
  
    // const slf = new SelafinMP(null,{keepframes:true,debug:1});
    // const [x,y,ikle]=grid();
    // slf.addTITLE("Grid - Test2");
    // slf.addVAR({'name':'BOTTOM','unit':'m'});
    // slf.addPOINTS(x,y);
    // slf.addIKLE(ikle);
    // const frame1=new Float32Array(slf.NVAR * slf.NPOIN3);
    // for(let i=0;i<frame1.length;i++)frame1[i]= parseFloat(i) / frame1.length;
    // slf.addFrame(frame1);
    // console.log(slf.TILES);
  
  
  
    t.end();
});
memoryUsage();


function memoryUsage(){
    let used = process.memoryUsage();
    for (let key in used) {
        console.log(`${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
    }  
}