/*global idb*/
// import idb from 'idb';
'use strict';
import Selafin from '../selafin';

import FetchDB from '../fetchdb';
import { extend } from '@julien.cousineau/util';
export default class SelafinSync extends Selafin{
    constructor(buffer,options){
        super(buffer,options);
        this.binaries = options.binaries || {};
   
        // for(const id in this.binaries)this.addVAR({name:id,unit:'m'});
        this.fetchdb = new FetchDB(options);
    }
    setBinaries(binaries){
        this.binaries=binaries; //{name:,title:,url:}
    }
  
    static async url(url,options){
        const fetchdb = new FetchDB(options);
        const buffer =  await fetchdb.getBuffer(url, {title:'Title',responseType:'arraybuffer'});
        return new SelafinSync(buffer, extend({keepbuffer:1},options));
    }
 
    async getFrame(frame,id){
        if(!id)throw new Error("Needs id");
    
        // || index.constructor !== String)return this._getFrame(frame,index);
        let index = this.varnames.findIndex(name=>name==id);
        if(index!=-1)return this._getFrame(frame,index);
    
        if(!this.binaries[id])throw new Error("id does not exist");
        const buffer = await this.fetchdb.getBuffer(this.binaries[id].url,extend(this.binaries[id],{title:id,responseType:'arraybuffer'}));
        const data = new Float32Array(buffer);
        // for(let i=0;i<data.length;i++)data[i]*=Math.random();
        return  data;
    }
    // async getBinaryFrame(frame,index){
    //   if(!this.binaries[index])throw new Error("id does not exist");
    //   const buffer = await this.fetchdb.getBuffer(this.binaries[index].url,extend(this.binaries[index],{responseType:'arraybuffer'}));
    //   return  new Float32Array(buffer);
    // }
  
 
}

