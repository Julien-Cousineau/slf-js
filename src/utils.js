
[Array,Int8Array,Int16Array, Int32Array,Uint8Array,Uint16Array, Uint32Array,Float32Array].forEach(item=>{
    if (!item.prototype.range) {
        item.prototype.range = function() {
            for(let i=0;i<this.length;i++)this[i]=i;
            return this;
        };
    }
    if (!item.prototype.random) {
        item.prototype.random = function() {
            for(let i=0;i<this.length;i++)this[i]=parseInt(Math.random()*(this.length-1));
            return this;
        };
    }    
    
    if (!item.prototype.clamp) {
        item.prototype.clamp = function(min, max) {
            for(let i=0;i<this.length;i++)this[i]=i.clamp(min,max);
            return this;
        };
    }

    if (!item.prototype.min) {
        item.prototype.min = function(){
            let min = +Infinity,len = this.length;
            for (let i=0 ; i < len; i++ )
                if ( this[i] < min ) min = this[i];
            return min;
        };
    }    
    
    
    if (!item.prototype.max) {
        item.prototype.max = function(){
            let max = -Infinity, len = this.length;
            for (let i=0 ; i < len; i++ )
                if ( this[i] > max ) max = this[i];
            return max;
        };
    }   
    
    if (!item.prototype.add) {
        item.prototype.add = function(value){
            for(let i=0,n=this.length;i<n;i++)this[i]+=value;
            return this;
        };
    }
    if (!item.prototype.subtract) {
        item.prototype.subtract = function(value){
            for(let i=0,n=this.length;i<n;i++)this[i]-=value;
            return this;
        };
    }
    if (!item.prototype.multiply) {
        item.prototype.multiply = function(value){
            for(let i=0,n=this.length;i<n;i++)this[i]*=value;
            return this;
        };
    }
    
    if (!item.prototype.divide) {
        item.prototype.divide = function(value){
            for(let i=0,n=this.length;i<n;i++)this[i]/=value;
            return this;
        };
    }        
    
    if (!item.prototype.compare) {
        item.prototype.compare = function( a ) {
            const epsilon = 1.0E-7;
            for (var i = 0, n = this.length; i<n; i++) {
                if (a[i] - this[i] > epsilon) return false;
            }
            return true;
        };        
    }
});
  
export const range=(n,type)=> {
    n = (typeof n !== 'undefined') ?  n : 0;
    if (!(Number.isInteger(n))) throw Error("Error in range: Value must be an integer");
    let array;
    
    if(type=='Uint8')  array = new Uint8Array(n);
    if(type=='Uint16') array = new Uint16Array(n);
    if(type=='Uint32') array = new Uint32Array(n);
    if(type=='Int8')  array = new Int8Array(n);
    if(type=='Int16') array = new Int16Array(n);
    if(type=='Int32') array = new Int32Array(n);
    if(type=='Float32')  array = new Float32Array(n);
    if((typeof type === 'undefined') || !array)array = new Array(n);
    
    for(let i=0;i<n;i++)array[i]=i;
    return array;
};