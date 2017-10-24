'use strict';

exports.range = function(end,type) {
    end = (typeof end !== 'undefined') ?  end : 0;
    if (!(Number.isInteger(end))) throw Error("Error in range: Value must be an integer");
    let array;
    if(type=='8') array = new Uint8Array(end);
    else if(type=='16') array = new Uint16Array(end);
    else if(type=='32') array = new Uint32Array(end);
    
    for(let i=0;i<end;i++){
        array[i]=i;
    }
    return array;
};

Float32Array.prototype.max = function(){
    var max = -Infinity, i = 0, len = this.length;
    for ( ; i < len; i++ )
      if ( this[i] > max ) max = this[i];
    return max;
};
Float32Array.prototype.min = function(){
    var min = +Infinity, i = 0, len = this.length;
    for ( ; i < len; i++ )
      if ( this[i] < min ) min = this[i];
    return min;
};