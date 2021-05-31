'use strict';

/* Debugger Function */
var Debugger = function Debugger() {},
    Logger = require('le_node');

Debugger.on = false;
Debugger.iPadOn = false;

var log = new Logger({
    token:'dca5a176-c079-4dcd-9236-ae1d16af3d71'
});

Debugger.log = function (m, r) {
	if( (Debugger.on !== true) && (Debugger.iPadOn) !== true ) return false;

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
	} catch (e) {
		//alert( message );
	} finally {
        log.log("debug", m);
		return m;
	}

	return m;
};

Debugger.typeOf = function (v) {
	return typeof v;
};

Debugger.profile = {
	time1: 0,
	time2: 0,
	start: function() {
		this.time1 = (new Date).getTime();
		return this.time1;
	},
	stop: function() {
		return ( this.check() - this.time1 );
	},
	check: function() {
		this.time2 = (new Date).getTime();
		return this.time2;
	}
};

try {
module.exports = Debugger;
} catch(e) {} finally { 1; }
