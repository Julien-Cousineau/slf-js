import Selafin from './selafin.js';
export default class SelafinGL extends Selafin{
    constructor(buffer,options){
        super(buffer,options);
    }
    get position(){return this.XY;}
    get indices(){return this.IKLE3F;}
    get indicesW(){return this.IKLE3W;}  
}

