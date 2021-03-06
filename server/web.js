var memory = require('./memory.js');
var util = require('../client/util.js');
var feature = require('./feature.js');
//var cortexit = require('./cortexit.js');
var bodyParser = require('body-parser');
var expressm = require('express');
var express = expressm();
var cookieParser = require('cookie-parser');
var connect = require('connect');
var http = require('http')
  , url = require('url')
  , fs = require('fs')
  , sys = require('util')
  , socketio= require('socket.io')
  , server;
var mongo = require("mongojs");
var request = require('request');
var session = require('express-session')
var _ = require('underscore');

/**
 * init - callback function that is invoked after the server is created but before it runs
 */
exports.start = function(host, port, database, init) {

	console.log('Starting');

	var Server = {
		memoryUpdatePeriodMS: 5000,
        plugins: { },
        permissions: { },
	};

	Server.host = host;
	Server.port = port;
	Server.database = database;


    var plugins = { };

	var that = { };
    that = init(Server);
	for( var p in that ) {
		/* Initialize the server with custom props set by init funtion */
		Server[p] = that[p];
	}


	var tags =  { };
    var properties = { };

	var attention = memory.Attention(0.95);

	var logMemory = util.createRingBuffer(256);
	Server.interestTime = { };	//accumualted time per interest, indexed by tag URI
	Server.clientState = { };	//current state of all clients, indexed by their clientID DEPRECATED

	var databaseUrl = Server.database || process.env['MongoURL']; //"mydb"; // "username:password@example.com/mydb"
	var collections = [ "obj" ];

    function plugin(netention, v) {
        var p = require('../plugin/' + v).plugin;
        var filename = v;
        v = v.split('.js')[0];
        v = v.split('/netention')[0];
        if (p) {
    		if (p.name) {

                var enabled = false;

                plugins[v] = p;
                if (!Server.plugins[v]) {
                    Server.plugins[v] = {
                        valid: true,
                        enabled: false
                    };
                }

                Server.plugins[v].name = p.name;
                Server.plugins[v].description = p.description;
                Server.plugins[v].filename = filename;

                //TODO add required plugins parameter to add others besides 'general'
                if ((Server.plugins[v].enabled) || (v == 'general')) {
                    p.start(netention, util);
                    enabled = true;
                }

                if (enabled) {
            	    nlog('Started plugin: ' + p.name);
                }
                else {
        		    nlog('Loaded inactive plugin: ' + p.name);
                }

    			return;
    		}
    	}
        Server.plugins[v] = { };
        Server.plugins[v].name = v;
        Server.plugins[v].valid = false;
        Server.plugins[v].filename = filename;


    	//TODO remove unused Server.plugins entries

    	console.log('Loaded invalid plugin: ' + v);
    }

	function loadState(f) {
		var db = mongo(databaseUrl, collections);

		db.obj.find({ tag: { $in: [ 'ServerState' ] } }).limit(1).sort({when:-1}, function(err, objs) {
    		  db.close();

              if( err || !objs) nlog("No state found");
			  else objs.forEach( function(x) {
				  var now = Date.now();
				  nlog('Resuming from ' + (now - x.when)/1000.0 + ' seconds downtime');
				  Server.interestTime = x.interestTime;
				  Server.clientState = x.clientState;

                  if (x.plugins) {
                      for (var pl in x.plugins) {
                          if (!Server.plugins[pl])
                            Server.plugins[pl] = { };
                          if (x.plugins[pl].enabled)
                            Server.plugins[pl].enabled = x.plugins[pl].enabled;
                      }
                  }

				  /* logMemory = util.createRingBuffer(256);
				  logMemory.buffer = x.logMemoryBuffer;
				  logMemory.pointer = x.logMemoryPointer;*/

				  //nlog("State loaded");
				  //nlog(Server);

			  } );

              if (f)
                f();

		});


	}

	function deleteObject(objectID, whenFinished) {
		attention.remove(objectID);

		function objectRemoved(uri) {
    	    return {
                'id': uri,
                'removed': true
    	    };
		}

		//TODO move to 'removed' db collection

		var db = mongo(databaseUrl, collections);
		db.obj.remove({ id: objectID }, function(err, docs) {
			db.close();

            if (err) {
                nlog('deleteObject: ' + err);
                if (whenFinished)
                    whenFinished(err);
            }
            else {
                //broadcast removal of objectID
                pub(objectRemoved(objectID));

                //remove replies
                db.obj.remove({ replyTo: objectID }, function(err, docs) {

                    nlog('deleted ' + objectID);

                    if (!err) {
                        if (whenFinished)
            		        whenFinished();
                    }
                    else {
                        nlog('deleteObject [replies]: ' + err);
                        if (whenFinished)
                            whenFinished(err);
                    }
                });
            }
		});
	}
    that.deleteObject = deleteObject;

    function noticeAll(l) {
        var i = 0;

        function remaining() {
            if (i < l.length) {
                notice(l[i++], remaining);
            }
        }
        remaining();
    }
    that.noticeAll = noticeAll;

	function notice(o, whenFinished) {
		if (!o.id)
			return;

		if (o._id)
			delete o._id;

        if (o.modifiedAt == undefined)
            o.modifiedAt = o.createdAt;

		attention.notice(o, 0.1);

		var db = mongo(databaseUrl, collections);
		db.obj.update({ id: o.id }, o, {upsert: true}, function(err) {
			if (err) {
				nlog('notice: ' + err);
			}

			db.close();

            if (whenFinished)
                whenFinished();
		});

	}
    that.notice = notice;


    function addProperties(ap) {
        for (var i = 0; i < ap.length; i++) {
    		properties[ap[i].uri] = ap[i];
    	}

        //TODO broadcast change in properties?
    }
    that.addProperties = addProperties;

    function addTags(at, defaultTag) {
        for (var i = 0; i < at.length; i++) {
            if (defaultTag)
                at[i].tag = defaultTag;

    		tags[at[i].uri] = at[i];
    	}

        //TODO broadcast change in tags?
    }
    that.addTags = addTags;

	function getObjectSnapshot(uri, whenFinished) {
		if (tags[uri]!=undefined) {
            //it's a tag
			whenFinished(tags[uri]);
		}
		else {
			var db = mongo(databaseUrl, collections);
			db.obj.find({ 'id': uri }, function(err, docs) {
    			db.close();
				if (err) {
                    nlog('getObjectSnapshot: ' + err);
					whenFinished(err);
				}
				else {
					whenFinished(docs);
				}
			});
		}

	}

    function getObjectsByAuthor(a, withObjects) {
    	var db = mongo(databaseUrl, collections);
        db.obj.find({author: a}, function(err, docs) {
    		if (err) {
				nlog('getObjectsByAuthor: ' + err);
			}
            else {
                withObjects(docs);
            }
			db.close();
		});
	}
    that.getObjectsByAuthor = getObjectsByAuthor;

    //TODO fix this to use the new tag data model
	function getObjectsByTag(t, withObject) {
		var db = mongo(databaseUrl, collections);
		//db.obj.find({ tag: { $in: [ t ] } }, function(err, docs) {
        db.obj.find(function(err, docs) {

    		if (err) {
				nlog('getObjectsByTag: ' + err);
                console.trace("Here I am!");
			}
            else {
                docs.forEach( function(d) {
                    if (util.objHasTag(d, t))
                        withObject(d);
                });
            }
			db.close();
		});
	}
    that.getObjectsByTag = getObjectsByTag;

    /*
    function getObjectsByTags(tags, withObjects) {
		var db = mongo(databaseUrl, collections);
		db.obj.find({ tag: { $in: tags } }, function(err, docs) {

			db.close();

			if (!err) {
				withObjects(docs);
			}
            else {
                nlog('getObjectsByTags: ' + err);
            }
		});
	}
    that.getObjectsByTags = getObjectsByTags;
    */

    function getReport(lat, lon, whenStart, whenStop, withReport) {
    	var db = mongo(databaseUrl, collections);

        var histogram = { };
        var numBins = 38;
        var numAnalyzed = 0;

        function getHistogramBin(t) {
            return ((t - whenStart) / (whenStop - whenStart)) * numBins;
        }

        db.obj.find(function(err, docs) {

    		if (err) {
				nlog('getReport: ' + err);
			}
            else {
                docs.forEach( function(d) {
                    var t = d.modifiedAt || d.createdAt;

                    if ((t <= whenStop) && (t >= whenStart)) {
                        var a = feature.objAnalysis(d);
                        var bin = parseInt(getHistogramBin(t));
                        for (var k in a) {
                            if (histogram[k] == undefined)
                                histogram[k] = [];
                            if (histogram[k][bin] == undefined)
                                histogram[k][bin] = 0;
                            histogram[k][bin] += a[k];
                        }
                        numAnalyzed++;
                    }
                });
                var x = {
                    id: '@somebody',
                    tStart: whenStart,
                    tStop: whenStop,
                    tSteps: numBins,
                    'numAnalyzed': numAnalyzed,
                    features: histogram,
                    conclusions: [
                        'Person laughs before cursing 60%',
                        'Person is simultaneously questioning and happy 85%',
                    ],
                    suggestions: [
                        'Person should buy <a href="http://www.amazon.com/gp/product/B001OORMVQ/ref=s9_simh_gw_p147_d1_i4?pf_rd_m=ATVPDKIKX0DER&pf_rd_s=center-2&pf_rd_r=1D1EGERGCVBCF3PMGYS7&pf_rd_t=101&pf_rd_p=1389517282&pf_rd_i=507846">SATA Adapter</a>',
                        'Person should talk to @otherperson'
                    ]
                };
                withReport(x);
            }
			db.close();
		});

    }


	function getTagCounts(whenFinished) {

		var db = mongo(databaseUrl, collections);
		db.obj.find(function(err, docs) {
			if (err) {
				nlog('getTagCounts: ' + err);
			}
            else {
            	var totals = { };

                docs.forEach( function(d) {
                    var ts = util.objTagStrength(d);
                    for (var dt in ts) {
                        if (totals[dt] == undefined) totals[dt] = 0;
                        totals[dt] += ts[dt];
                    }
                });
            }

    		db.close();

			whenFinished(totals);
		});
	}


	function saveState(onSaved, onError) {
		var t = Date.now()

		/*
		logMemoryBuffer = logMemory.buffer;
		logMemoryPointer = logMemory.pointer;*/

		delete Server._id;
		Server.tag = [ 'ServerState' ];
		Server.when = t;


		var db = mongo(databaseUrl, collections);

		db.obj.save(Server, function(err, saved) {
    		  db.close();

			  if( err || !saved ) {
    		      if (onError) {
    		        nlog('saveState: ' + err);
				    onError(err);
    		      }
			  }
			  else {
    		    if (onSaved)
				  onSaved();
			  }

		});

	}

	loadState(function() {
        loadPlugins();
	});

	//process.stdin.on('keypress', function(char, key) {
	//	  if (key && key.ctrl && key.name == 'c') {
	//   	    nlog('State saved');
	//		saveState();
	//	    process.exit();
	//	  }
	//});

	function finish() {
		 saveState(
			function() { nlog("State saved");} ,
		 	function(err) { nlog("State not save " + err); }
		 );
		 process.exit();
		 console.log('FINISHED');
	}

	process.on('SIGINT', finish);
	process.on('SIGTERM', finish);


	function nlog(x) {

		var xs = x;
		if (typeof(x)!="string")
			xs = JSON.stringify(x,null,4);

		var msg = new Date() + ': ' + xs;

		console.log(x);
		logMemory.push(msg);
	}
	function sendJSON(res, x, pretty) {
		res.writeHead(200, {'content-type': 'text/json' });
		var p;
		if (!pretty)
			p = JSON.stringify(x);
		else
			p = JSON.stringify(x,null,4);
		res.end( p );
	}

	http.globalAgent.maxSockets = 256;

	var httpServer = http.createServer(express);

	httpServer.listen(Server.port);

	nlog('Web server listenting @ http://127.0.0.1:' + Server.port);

	var io = socketio.listen(httpServer, {

		// io.enable('browser client minification');  // send minified client
		// io.enable('browser client etag');          // apply etag caching logic based on version number
		// io.enable('browser client gzip');          // gzip the file
		// io.set('log level', 1);                    // reduce logging
		// io.set('transports', [                     // enable all transports (optional if you want flashsocket)
		//     'websocket'
		// //  , 'flashsocket'
		//   , 'htmlfile'
		//   , 'xhr-polling'
		//   , 'jsonp-polling'
		// ]);
		// io.set("polling duration", 10);
		'transports': [                     // enable all transports
			'websocket'
			// , 'htmlfile'
			// , 'xhr-polling'
			// , 'jsonp-polling'
		]
	});

	var sessionStore = session({ // new session.MemoryStore();
		resave: true,
		saveUninitialized: true,
		secret: '$ecr3t'
	});
	var SessionSockets = require('session.socket.io')
	  , sessionSockets = new SessionSockets(io, sessionStore, cookieParser('netention0'));

	//PASSPORT --------------------------------------------------------------
	var passport = require('passport')
	  , OpenIDStrategy = require('passport-openid').Strategy
	  , GoogleStrategy = require('passport-google').Strategy;

	passport.serializeUser(function(user, done) {
	  done(null, user);
	});

	passport.deserializeUser(function(obj, done) {
	  done(null, obj);
	});

	// express.configure(function() {
	  express.use(cookieParser('netention0'));
	  express.use(bodyParser.urlencoded({ extended: false }));
	  express.use(sessionStore);
	  express.use(passport.initialize());
	  express.use(passport.session());
	  express.use(expressm.Router());
	// });


	passport.use(new OpenIDStrategy({
	    returnURL: 'http://' + Server.host + '/auth/openid/return',
	    realm: 'http://' + Server.host + '/'
	  },
	  function(identifier, done) {
	  	//console.log(identifier);
	  	//console.log(done);
	  	done(null, { id: identifier } );
	    // User.findOrCreate({ openId: identifier }, function(err, user) {
	      // done(err, user);
	    // });
	  }
	));

	passport.use(new GoogleStrategy({
	    returnURL: 'http://' + Server.host + '/auth/google/return',
	    realm: 'http://' + Server.host + '/'
	  },
	  function(identifier, profile, done) {
	  	//console.log(identifier);
	  	//console.log(done);
	  	//console.log('google', profile);
	  	done(null, {id: identifier, email: profile.emails[0].value } );
	    // User.findOrCreate({ openId: identifier }, function(err, user) {
	      // done(err, user);
	    // });
	  }
	));

	// Accept the OpenID identifier and redirect the user to their OpenID
	// provider for authentication.  When complete, the provider will redirect
	// the user back to the application at:
	//     /auth/openid/return
	express.post('/auth/openid', passport.authenticate('openid'));
	// The OpenID provider has redirected the user back to the application.
	// Finish the authentication process by verifying the assertion.  If valid,
	// the user will be logged in.  Otherwise, authentication has failed.
	express.get('/auth/openid/return',
	  passport.authenticate('openid', { successRedirect: '/#/reconnect',
	                                    failureRedirect: '/login.html' }));


	express.get('/auth/google', passport.authenticate('google'));
	express.get('/auth/google/return',
	  passport.authenticate('google', { successRedirect: '/#/reconnect',
	                                    failureRedirect: '/login.html' }));
	// -------------------------------------------------------------- PASSPORT


    express.all('*', function(req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });

    var oneYear = 31557600000;
    express.use("/", expressm.static('./client', { maxAge: oneYear }));
    express.use("/plugin", expressm.static('./plugin', { maxAge: oneYear }));

    express.post('/upload', function(req, res) {
        //TODO validate permission to upload

        var temp_path = req.files.uploadfile.path;
        var save_path = './upload/' + util.uuid() + '_' + req.files.uploadfile.name;

        fs.rename(temp_path, save_path, function(error) {
            if (error) throw error;

            fs.unlink(temp_path, function() {
                if (error) throw error;
                //res.send("File uploaded to: <a href='" + save_path + "'>here</a>.");
                res.send(save_path);
            });

        });
    });

    express.get('/#', function(req,res) {
       res.sendfile('./client/index.html');
    });

    /*
    express.get('/http/:url', function (req, res) {
        if (Server.permissions['authenticate_to_proxy_http']!=false) {
        	if (!isAuthenticated(req.session)) {
	    		res.send('Authentication required');
	    	}
        }

    	var uri = decodeURIComponent(req.params.url);
        request(uri, function (error, response, body) {
            res.setHeader('Content-type', 'text/plain');
            if (!error)  {
                res.send(response.body);
            }
            else {
                res.send(error);
            }
        });
    });
    */

	express.get('/log', function (req, res) {
		sendJSON(res, logMemory.buffer);
	});
    express.get('/object/latest/:num/json', function(req, res) {
        var n = parseInt(req.params.num);
		var db = mongo(databaseUrl, collections);
       	db.obj.find().limit(n).sort({modifiedAt:-1}, function(err, objs) {
               sendJSON(res, objs);
               db.close();
       	});
    });
	express.get('/object/:uri', function (req, res) {
		var uri = req.params.uri;
		res.redirect('/object.html?id=' + uri);
	});
	express.get('/object/:uri/json', function (req, res) {
		var uri = req.params.uri;
		getObjectSnapshot(uri, function(x) {
			sendJSON(res, x);
		});
	});

	express.get('/state', function (req, res) {
		sendJSON(res, Server);
	});
	express.get('/attention', function (req, res) {
		getTagCounts(function(x) {
			sendJSON(res, x, false);
		});
	});
	express.get('/save', function (req, res) {
		sendJSON(res, 'Saving');
		saveState(
			function() { nlog('State Saved'); } ,
		 	function(err) { nlog('State Save unccessful: ' + err) }
		);
	});
	express.get('/team/interestTime', function (req, res) {
		updateInterestTime();
		sendJSON(res, Server.interestTime);
	});
	express.post('/notice', function(req, res){

	    //console.log(req.body.user.name);
	    //console.log(req.body.user.email);

	});
	express.get('/logout', function(req, res){
	  req.logout();
	  res.redirect('/');
	});

    express.get('/report', function(req, res) {
        getReport(
            parseFloat(req.query['lat']),
            parseFloat(req.query['lon']),
            parseFloat(req.query['whenStart']),
            parseFloat(req.query['whenStop']),
            function(r) {
                sendJSON(res, r);
            }
        );
    });



	var channelListeners = {};

	function broadcast(socket, message) {
		notice(message);


        if (socket)
		    nlog(socket.clientID + ' broadcast: ' + JSON.stringify(message, null, 4));

		var targets = { };

        var ot = util.objTags(message);
		for (var t = 0; t < ot.length; t++) {
			var chan = ot[t];

			var cc = io.sockets.clients(chan);
			for (var cck in cc) {
				var i = cc[cck].id;
                if (socket)
					if (i!=socket.id)
    					targets[i] = '';
			}
		}

		for (var t in targets) {
			io.sockets.socket(t).emit('notice', message);
		}


        io.sockets.in('*').emit('notice', message);

        for (var p in plugins) {
            var pp = plugins[p];
            if (Server.plugins[p].enabled) {
                if (pp.notice) {
                    pp.notice(message);
                }
            }
        }
	}
    that.broadcast = broadcast;

	function pub(message) {
        broadcast(null, message);
	}
    that.pub = pub;

	function isAuthenticated(session) {
	   if (session)
			if (session.passport)
				if (session.passport.user) {
					return true;
				}
	   	return false;

	}

	sessionSockets.on('connection', function (err, socket, session) {

		//https://github.com/LearnBoost/socket.io/wiki/Rooms
		socket.on('subscribe', function(channel, sendAll) {
			sub(socket, channel, sendAll);
		});
		socket.on('unsubscribe', function(channel) {
			unsub(socket, channel);
		});


	    socket.on('pub', function(message) {
			broadcast(socket, message);
	    });

        socket.on('getPlugins', function(f) {
            f(Server.plugins);
        });

        socket.on('setPlugin', function(pid, enabled, callback) {
            if (Server.permissions['authenticate_to_configure_plugins']!=false) {
                if (!isAuthenticated(session)) {
    	    		callback('Unable to configure plugins (not logged in)');
    	    		return;
    	    	}
            }

            var pm = plugins[pid];
            if (pm) {
                if (!(Server.plugins[pid].valid == false)) {
                    var currentState = Server.plugins[pid].enabled;
                    if (currentState!=enabled) {
                        if (enabled) {
                            Server.plugins[pid].enabled = true;
                            pm.start(that, util);
                            nlog('Plugin ' +  pid + ' enabled');
                        }
                        else {
                            Server.plugins[pid].enabled = false;
                            pm.stop(that);
                            nlog('Plugin ' +  pid + ' disabled');
                        }
                        saveState(function() {
                            //nlog('saved state');
                        }, function(err) {
                            nlog('error saving state on plugin activation');
                            nlog(err);
                        });
                        callback();
                        return;
                    }
                }
            }
            callback('Unable to set activity of plugin ' + pid + ' to ' + enabled);

        });


	    socket.on('connectSelf', function(cid) {
	       var key = null, email = null;
	   	   if (session)
	   			if (session.passport)
	   				if (session.passport.user) {
	   					key = session.passport.user.id;
	   					email = session.passport.user.email;
                        /*if (session.passport.user.clientID)
                            cid = session.passport.user.clientID;
                        else {
                            session.passport.user.clientID
                        }*/
	   				}

            if (key)
               cid = util.MD5(key);
            else if (!cid) {
	       	   cid = util.uuid();
	        }

	       nlog('connect: ' + cid + ', ' + key);
	       socket.set('clientID', cid);
	       socket.emit('setClientID', cid, key);

		   //share server information
	       socket.emit('setServer', Server.name, Server.description);

	       //share tags
	       socket.emit('addTags', tags, properties);

           getObjectsByTag('Tag', function(to) {
               socket.emit('notice', to);
           });
           getObjectsByAuthor(cid, function(uo) {
               socket.emit('notice', uo);
           });
	    });

	    socket.on('updateSelf', function(s, getObjects) {
	        socket.get('clientID', function (err, c) {
	            if (c == null) {
	                socket.emit('reconnect');
	            }
	            else {
	            	socket.clientID = c;

					notice(s);

	                //broadcast client's self
	                socket.broadcast.emit('notice', s);

	                s.created = Date.now();
	                updateInterests(c, s, socket, getObjects);
	            }
	        });
	    });

        /*
	    socket.on('getSentencized', function(urlOrText, withResult) {
	    	cortexit.getSentencized(urlOrText, withResult);
	    });
        */

	    socket.on('getObjects', function(query, withObjects) {
			var db = mongo(databaseUrl, collections);
			db.obj.find(function(err, docs) {
				withObjects(docs);
				db.close();
			});
	    });

	    socket.on('delete', function(objectID, whenFinished) {
            if (Server.permissions['authenticate_to_delete_objects']!=false) {
    	    	if (!isAuthenticated(session)) {
    	    		whenFinished('Unable to delete (not logged in)');
    	    		return;
    	    	}
            }

	    	if (!util.isSelfObject(objectID))
	    		deleteObject(objectID, whenFinished);
            else {
                whenFinished('Unable to delete user profile');
            }
	    });

	});



	function updateInterestTime() {
		//reprocess all clientState's to current time
		for (c in Server.clientState) {
			var cl = Server.clientState[c];
			updateInterests(c, cl);
		}
	}

	function sub(socket, channel, sendExisting) {
		//nlog(socket.clientID + ' subscribed ' + channel );
		socket.join(channel);

		if (sendExisting) {
			getObjectsByTag(channel, function(objects) {
				socket.emit('notice', objects);
			});
		}
	}
	function unsub(socket, channel) {
		nlog(socket.clientID + ' unsubscribed ' + channel );
		socket.leave(channel);
	}

	function interestAdded(socket, interest) {
		sub(socket, interest, true);
	}
	function interestRemoved(socket, interest) {
		unsub(socket, interest);
	}

	function updateInterests(clientID, state, socket, resubscribe) {
		var prevState = Server.clientState[clientID];
		var now = Date.now();

		if (!prevState) {
			prevState = { interests: { }, when: new Date().getTime() };
		}

		var addends = { };

		for (var k in state.interests) {
			var v = state.interests[k];

			if (prevState.interests==undefined)
				prevState.interests = { };

			var pv = prevState.interests[k];

			if (resubscribe) {
				if (socket)
					interestAdded(socket, k);
			}
			if (pv==undefined) {
				pv = 0;
				if (socket)
					if (!resubscribe)
						interestAdded(socket, k);
			}

			else {
				var averageInterest = (v + pv)/2.0;
				if (Server.interestTime[k] == undefined)
					Server.interestTime[k] = 0;
				 addends[k] = (now - prevState.when)/1000.0 * averageInterest ;
			}
		}
		for (var k in prevState.interests) {
			var v = state.interests[k];
			var pv = prevState.interests[k];
			if (v==undefined) {
				v = 0;
				var averageInterest = (v + pv)/2.0;
				if (Server.interestTime[k] == undefined)
					Server.interestTime[k] = 0;
				addends[k] = (now - prevState.when)/1000.0 * averageInterest ;

				if (socket)
					interestRemoved(socket, k);
			}

		}
		var addendSum = 0;
		for (k in addends) {
			addendSum += addends[k];
		}
		for (k in addends) {
			var a = addends[k];
			if (Server.interestTime[k] == undefined)
				Server.interestTime[k] = 0;
			Server.interestTime[k] += a / addendSum;
		}


		state.when = now;
		Server.clientState[clientID] = state;

	}

	// process.on('uncaughtException', function (err) {
	   // console.error('An uncaught error occurred!');
	   // console.error(err.stack);
	// });
	process.on('uncaughtException', function(err) {
        console.error(err.stack);
    });



	//setInterval(attention.update, Server.memoryUpdatePeriodMS);

    require('./general.js').plugin.start(that);

    function loadPlugins() {
    	fs.readdirSync("./plugin").forEach(function(file) {
            if (file === 'README')
                return;

    		if (file.indexOf('.js')==-1) {//avoid directories
    			file = file + '/netention.js';
    		}

    		plugin(that, file);
    	});
    }

    nlog('Ready');

	return that;

};

