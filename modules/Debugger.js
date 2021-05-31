'use strict';

/* Debugger Function */
var Debugger = function Debugger() {};

Debugger.on = false;
Debugger.iPadOn = false;

Debugger.log = function( m, r ) {
setTimeout(function() {
	if ((Debugger.on !== true) && (Debugger.iPadOn) !== true) return false;

	var message = m;
	var cache = [];

	//if( typeof message === 'array' ) message = m +"";

	if( typeof message === 'boolean' ) message = m +"";

	if( typeof message === 'number' ) message = m +"";

	if( typeof m === 'object' ) try {
		message =  JSON.stringify( m, function(key, value) {
    		if( (typeof value === 'object') && (value !== null) ) {
    			if (cache.indexOf(value) !== -1) {
					/* Circular reference found, discard key */
					return;
    			}
    			/* Store value in our collection */
    			cache.push(value);
    		}
    		return value;
		} );
	} catch (e) {
		message = m;
		//Debugger.log(  "Could not stringify object or value:\n"+ e.message +"\n" );
	} finally {
		cache = null;
		if( typeof message !== "string" ) message = m;
	}

	if( (r !== undefined) && (typeof message === 'string') )
	  message = r.replace(/\$1/, message);

	try {
		console.log( message );
		console.log( "\n" );
        log.log("debug", m);
	} catch (e) {
		//alert( message );
	} finally {
		return m;
	}
}, 33);

	return m;
};

Debugger.typeOf = function (v) {
	return typeof v;
};

Debugger.profile = {
	time1: 0,
	time2: 0,
	start: function () {
		this.time1 = new Date();
		return this.time1;
	},
	stop: function (startTime) {
        if (startTime) return (this.check() - startTime.getTime());
		else return ( this.check() - this.time1.getTime() );
	},
	check: function () {
		this.time2 = new Date();
		return this.time2.getTime();
	}
};

try {
module.exports = Debugger;
} catch(e) {} finally { 1; }
