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

Uint32Array.prototype.add = function(value){
  for(let i=0,n=this.length;i<n;i++){
    this[i]+=value;
  }
};


Float32Array.prototype.compare = function( a ) {
  const epsilon = 1.0E-7;
    for (var i = 0, n = this.length; i<n; i++) {
      if (a[i] - this[i] > epsilon) return false
    }
  return true
}
  