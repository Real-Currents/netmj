#!/usr/bin/env node

/*
 * Netention Web Server Example
 * 
 * DO NOT EDIT 
 * Copy this file to 'web.start.js' and then configure 
 * and customize your servers. Start server with command:
 * > node web.start.js
 *
 */

var web = require('./server/web.js').start(
  'localhost',		/* domain/ip, include :port if necessary */ 
		
  8080, 			/* port */ 
		
  'test',			/* mongodb, ex: 'localhost/test' or 'test' */
		
  function( net ) { 

	net.name = 'Server Name';
	net.description = 'http://server-domain.com';
    
    //net.configFile = 'client.js';
	/* Use the following permissions to set auth requirements */
    net.permissions['authenticate_to_configure_plugins'] = false;
    net.permissions['authenticate_to_create_objects'] = false;
    net.permissions['authenticate_to_delete_objects'] = false;
    net.permissions['authenticate_to_proxy_http'] = false;
    net.permissions['authenticate_to_create_profiles'] = false;
    net.permissions['anyone_to_enable_or_disable_plugin'] = true;

    //net.permissions['twitter_key'] = 'CONSUMER_KEY:CONSUMER_SECRET';

    //Plugins to auto-enable
    //net.enablePlugins = [ /* 'earthquake', 'rss' */ ];

	return net;
  }
);
