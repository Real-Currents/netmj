//http://earthquake.usgs.gov/earthquakes/catalogs/

//Past 7 Days - M 5+ earthquakes 
//http://earthquake.usgs.gov/earthquakes/catalogs/eqs7day-M5.xml
var rss = require('../rss.js');

exports.USGSEarthquakes = function() {
	return rss.RSSFeed('chat', 'http://earthquake.usgs.gov/earthquakes/catalogs/eqs7day-M5.xml', function(eq) {
		console.log('earthquake');
		eq.eqMagnitude = parseFloat( eq.name.substring(1, eq.name.indexOf(',')));
		console.dir(eq);
		return eq;
	});
};
