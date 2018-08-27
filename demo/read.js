const Selafin =require('../src');
const fs = require('fs');

module.exports = function(filename){
    const buffer = fs.readFileSync(filename)
    const slf=new Selafin(buffer,{keepbuffer:1})
    slf.printAttributes();
    
}