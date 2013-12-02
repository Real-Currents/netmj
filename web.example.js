/*
 * Netention Web Server Example
 * 
 * Edit this to configure and customize your servers. 
 */
var web = require('./server/web.js');

web.start(
  '173.246.105.50:8080', 			/* domain/ip, include :port if necessary */ 
		
  8080, 			/* port */ 
		
  'test',	/* mongodb domain/ip, ex: 'localhost/test' */
		
  function() {	
	//after ready, call this
	return true;
  }
);
