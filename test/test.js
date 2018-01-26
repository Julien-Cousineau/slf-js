'use strict';

const t = require('tape');
const fs = require('fs');
const util = require('../src/util.js');
const selafin = require('../src/slf.js');
const values = require('../data/demo1.js');


const filename_0 = './data/demo1.slf';
const filename_1 = './data/mesh.1800.slf';
const filename_2 = './data/mesh.1800.10.slf';

// const filename_10 = '../data/demo1.slf';

t('Create range', function (t) {
    t.same(new Uint8Array([0,1,2,3,4,5,6,7,8,9]), util.range(10,'8'));
    t.same(new Uint16Array([0,1,2,3,4,5,6,7,8,9]), util.range(10,'16'));
    t.same(new Uint32Array([0,1,2,3,4,5,6,7,8,9]), util.range(10,'32'));
    t.end();
});

t('Create Selafin object - Single Frame', function (t) {

  fs.readFile(filename_0, function(err, buffer) {
    if(err){throw Error(err)}
    let slf = new selafin(buffer,{keepbuffer:1,debug:1});
    t.same(values.NELEM3,slf.NELEM3);
    t.same(values.NPOIN3,slf.NPOIN3);
    t.same(values.NFRAME,slf.NFRAME);
    t.same(values.MESHX.compare(slf.MESHX),true);
    t.same(values.MESHY.compare(slf.MESHY),true);
    t.same(values.ELEMENTS,slf.getElement());
    t.same(values.TRIXY.compare(slf.TRIXY),true);
    t.same(values.TRIAREA.compare(slf.TRIAREA),true);
    t.same(values.CX.compare(slf.CX),true);
    t.same(values.CY.compare(slf.CY),true);
    // console.log(slf.MESHX)
    t.end();    
  });
});
t('Create Selafin object - Single Frame', function (t) {

  fs.readFile(filename_1, function(err, buffer) {
    if(err){throw Error(err)}
    let slf = new selafin(buffer,{fromProj:'EPSG:3156',toProj:'EPSG:4326',keepbuffer:1,debug:1});
    let frames = slf.getELEMENTFRAME();
    // console.log(frames);
    // t.same(values.NELEM3,slf.NELEM3);
    // t.same(values.NPOIN3,slf.NPOIN3);
    // t.same(values.NFRAME,slf.NFRAME);
    t.end();    
  });
});
t('Create Selafin object - Single Frame', function (t) {

  fs.readFile(filename_1, function(err, buffer) {
    if(err){throw Error(err)}
    let slf = new selafin(buffer,{fromProj:'EPSG:3156',toProj:'EPSG:4326',keepbuffer:1,debug:1});
    let frames = slf.getELEMENTFRAME();
    // console.log(frames);
    // t.same(values.NELEM3,slf.NELEM3);
    // t.same(values.NPOIN3,slf.NPOIN3);
    // t.same(values.NFRAME,slf.NFRAME);
    t.end();    
  });
});

// t('Create Selafin object - Multiple Frame', function (t) {

//   fs.readFile('test.2D.10.slf', function(err, buffer) {
//     if(err){throw Error(err)}
//     let slf = new selafin(buffer,{keepbuffer:1,debug:0});
//     t.same(values.NELEM3,slf.NELEM3);
//     t.same(values.NPOIN3,slf.NPOIN3);
//     t.same(values.NFRAME10,10);
//     t.same(values.MESHX,slf.MESHX);
//     t.same(values.MESHY,slf.MESHY);
//     t.same(values.ELEMENTS,slf.getElement());
//     t.same(values.COORDS,slf.ELEMENTXY);
//     t.same(values.AREA,slf.ELEMENTAREA);
//     t.same(values.CX,slf.CX);
//     t.same(values.CY,slf.CY);
//     t.same(values.FRAME10,slf.getFrame(9));
//     t.end();    
//   });
// });


function memoryUsage(){
  let used = process.memoryUsage();
  for (let key in used) {
    console.log(`${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
  }  
}