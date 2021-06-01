'use strict';

const Debugger = require('./lib/Debugger'),
    express = require('express'),
	// favicon =	require('serve-favicon'),
    fs = require('fs'),
    join = require('path').join,
    config = (fs.existsSync('./config.json'))?
        require('./config.json') :
        require('./config'),
    port = process.env.PORT || config.port,
    timeout = process.env.TIMEOUT || config.timeout;

Debugger.on = true;

const app = express();

app.all(/\/public\/.*/, express.static('.'))

    .use('*/vector/*', require('./routes/mapzen'))

    .use(express.static(join(__dirname, 'public')))

    // .use(favicon(join(__dirname, 'public/favicon.ico')))

    .set('port', port)

    .set('timeout', timeout)

    .listen(port, function () {
        var startup = new Date();
        Debugger.log('Server is starting on '+ startup.toDateString() +' '+ startup.toTimeString() );
        Debugger.log('Server is listening at http://localhost:'+ port +'\n');
        //Debugger.on = false;
    });
