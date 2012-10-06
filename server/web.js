var sensor = { };

var config = require('../config.js');

var http = require('http')
  , url = require('url')
  , fs = require('fs')
  , sys = require('sys')
  , nodestatic = require('node-static')
  , server;
  

var file = new(nodestatic.Server)('./client');




var httpServer = http.createServer(function(req, res){
  
  req.addListener('end', function () {
    file.serve(req, res);
  });
});

httpServer.listen(config.port);

console.log('Web server on port ' + config.port);

var nowjs = require("now");
var everyone = nowjs.initialize(httpServer);

everyone.now.distribute = function(message){  
  everyone.now.receive(this.now.name, message); // this.now exposes caller's scope
};


function addSensor(path) {
    var s = require('./../client/sensor/' + path + '.js');
    var se = s.sensor;
    
    if ((s === undefined) || (se === undefined)) {
        console.error('Sensor: ' + path + ' not found');
        return;
    }
    
    se.clientJS = '/sensor/' + path + '.client.js';
    
    sensor[se.id()] = se;

    se.refresh(sensor, function() { 
        console.log('Added sensor: ' + se.id());
    }, function() { 
        console.error('Error adding sensor: ' + se.id());
    });

    
};

everyone.now.getSensors = function(withSensors) {
    withSensors(sensor);
};

everyone.now.getSensor = function(id, withSensor) {
    if (sensor[id]!=undefined) {
        withSensor(sensor[id]);
    }
    else {
        console.error('Unknown sensor: ' + id);
    }
};

addSensor('geology/USGSEarthquake');
addSensor('pollution/IAEANuclear');
addSensor('geology/MODISFires');

