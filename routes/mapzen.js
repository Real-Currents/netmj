var Debugger = require('../lib/Debugger'),
    baseUrl = 'https://tile.nextzen.org',
    express = require('express'),
    mapzen = express.Router(),
    fs = require('fs'),
	request = require('request'),
    stream = require('stream'),
    util = require('util'),
    zlib = require("zlib");

mapzen.get('/', proxy); //proxy_cache); // call 'proxy' directly to skip caching tiles

function proxy (req, res, next) {
    var headers = {},
        gzip = zlib.createGunzip();

    for( var h in req.headers) {
        headers[h] = req.headers[h];
    }
    delete headers["host"];

    headers["Host"] = "tile.nextzen.org";
    headers["Origin"] = "http://localhost:8080";
    headers["Referer"] = "http://localhost:8080";

    req.startTime = Debugger.profile.start();

    return new Promise(function (resolve, reject) {

        var resBody,
            response = request.get({
                encoding: null,
                baseUrl: baseUrl,
                headers: headers,
                timeout: 3333,
                url: (req.originalUrl.match(/\?/) !== null) ?
                    req.originalUrl :
                    req.originalUrl + '?api_key=8lKrgg_MS0-h5H-be87gYA'
            }, function callback (error, response, body) {

                (function () {

                    req.stopTime = Debugger.profile.stop(res.startTime);
                    //response = res;

                    if (!error && response.statusCode == 200) {
                        Debugger.log("PROFILE: " + req.stopTime + "ms to " + req.method + "\n" + req.originalUrl + "\n");
                        res.status(200);
                        res.set('Access-Control-Allow-Origin', '*');
                        res.set('Content-Type', 'application/json');

                        var filepath = 't/'+ req.originalUrl.substring(1, req.originalUrl.indexOf('?'));

                        if (body && body.type === "FeatureCollection") {
                            resBody = body;

                            try {
                                res.send(resBody.replace(/undefined/, ""));
                            } catch (e) {
                                Debugger.log(e.stack);
                            }

                        } else try {
                            /* Decompress a gzip stream */
                            bufferStream = new stream.PassThrough();

                            // Debugger.log(body, "Decompressing gzip response..."); //\n$1");

                            bufferStream.pipe(gzip)
                                .on('data', function (data) {
                                    data = data.toString('utf-8');
                                    resBody += data;
                                })
                                .on('end', function () {
                                    //Debugger.log(resBody.replace(/undefined/, ""));
                                    var decompressed = resBody.replace(/undefined/, "");

                                    res.send(decompressed); // Send decompressed json

                                    response.pipe(res);

                                    setTimeout(function () {
                                        console.log("Saving tile to " + filepath);
                                        try {
                                            const tile_result = JSON.parse(decompressed);
                                            for( var h in response.headers) {
                                                headers[h] = response.headers[h];
                                            }
                                            delete headers["cache-control"];
                                            delete headers["content-encoding"];
                                            delete headers["content-length"];

                                            Debugger.log(headers);

                                            var path = filepath.replace(/(\/[\d]+\/[\d]+)\/[\d]+(\.[\w]+)?$/, "$1");
                                            Debugger.log("Path to directory: ");
                                            Debugger.log(path);

                                            fs.stat(path, function (e1, s1) {

                                                Debugger.log("File: ");
                                                Debugger.log(filepath);

                                                if (e1 === null) {

                                                    fs.writeFileSync(filepath.replace(/\.(?:png|json|topojson)/, '.headers.json'), JSON.stringify(headers));

                                                    fs.writeFile(filepath, JSON.stringify(tile_result, null, 2), (err) => {
                                                        if (err) {
                                                            Debugger.log(decompressed);
                                                            Debugger.log(err);
                                                            throw err;
                                                        }
                                                        console.log(filepath + ' has been saved!');
                                                    });

                                                } else {
                                                    console.log("mkdir", path);

                                                    fs.mkdir(path, { recursive: true }, function (err1) {
                                                        if (!!err1) {
                                                            Debugger.log(err1);
                                                            throw err1;

                                                        } else {
                                                            console.log("Created ", path);

                                                            fs.writeFileSync(filepath.replace(/\.(?:png|json|topojson)/, '.headers.json'), JSON.stringify(headers));

                                                            fs.writeFile(filepath, JSON.stringify(tile_result, null, 2), (err2) => {
                                                                if (!!err2) {
                                                                    Debugger.log(decompressed);
                                                                    Debugger.log(err2);
                                                                    throw err2;
                                                                }
                                                                console.log(filepath + ' has been saved!');
                                                            });
                                                        }
                                                    })
                                                }
                                            });



                                        } catch (e) {
                                            Debugger.log(decompressed);
                                            Debugger.log(e);
                                            Debugger.log(e.stack);
                                        }
                                    }, 33);

                                    resolve(response);
                                })
                                .on('error', function (e) {
                                    Debugger.log(e.stack, "Failed to decompress gzip response: $1");
                                    bufferStream = null;
                                    res.send(body); // Send pure binary
                                });

                            bufferStream.end(body, 'utf8', function () {
                                bufferStream = null;
                            });

                        } catch (e) {
                            Debugger.log(e.stack, "Failed to decompress gzip response: $1");
                            resBody = body;

                            try {
                                res.send(resBody.replace(/undefined/, ""));
                            } catch (e) {
                                Debugger.log(e.stack);
                            }
                        }

                        status = 200;

                    } else {
                        Debugger.log("TIMEOUT: " + req.stopTime + "ms to " + req.method + "\n" + req.originalUrl);
                        res.status(500)

                        if (typeof error === "string") res.end(error);
                        else res.end();

                        status = 500;
                    }

                })();
            });

    });
}

function proxy_cache(req, res) {

    ('t'+ req.baseUrl).match(/([\w]+)+/g).forEach(function(val, idx, a) {
        if ( idx > 0 ) {
            var path = val;
            for (var i=idx; i>0; i--) {
                if (parseInt(i) > parseInt(a.length - 2)) path = a[i-1] +'.'+ path;
                else path = a[i-1] +'/'+ path;
            }
            fs.stat(path, function (e, s) {
                if (e != null && path.match(/\/[\d]+\/[\d]+\/[\d]+(\.[\w]+)?$/) === null) {
                    Debugger.log("Directory: ");
                    Debugger.log(path);
                    fs.mkdir(path, function() {});

                } else if (idx > (a.length - 2)) {
                    var finalDir = path.replace(/(\/[\d]+\/[\d]+)\/[\d]+(\.[\w]+)?$/, "$1");
                    Debugger.log("Last directory: ");
                    Debugger.log(finalDir);

                    fs.stat(finalDir, function (e1, s1) {

                        var filepath = path;
                        Debugger.log("File: ");
                        Debugger.log(filepath);

                        if (e1 == null) fs.stat(filepath, function (e2, s2) {
                            Debugger.log(baseUrl + req.originalUrl);

                            if (e2 != null) {
                                Debugger.log(filepath +" will be downloaded");

                                var headers = {},
                                    proxiedResponse = proxy(req, res, filepath);

                                proxiedResponse.then(function (response) {
                                    // Debugger.log(response);

                                    try {
                                        for( var h in response.headers) {
                                            headers[h] = response.headers[h];
                                        }
                                        delete headers["cache-control"];
                                        delete headers["content-encoding"];
                                        delete headers["content-length"];

                                        Debugger.log(headers);

                                        fs.writeFileSync(filepath.replace(/\.(?:png|json|topojson)/, '.headers.json'), JSON.stringify(headers));
                                        response.pipe(fs.createWriteStream(filepath));

                                    } catch (err) {
                                        Debugger.log(err);

                                    }

                                });

                            } else {
                                Debugger.log(filepath +" "+ (s1.isFile()? "was saved to disk": "is not available"));
                                fs.readFile(filepath.replace(/\.(?:png|json|topojson)/, '.headers.json'), function(e, d) {
                                    var headers = JSON.parse(d);
                                    for( var h in headers) {
                                        res.set(h, headers[h]);
                                    }
                                    fs.readFile(filepath, function (e, d) {
                                        res.end(d, 'binary');
                                    });
                                });

                                return true;
                            }
                        });
                    });
                }

                return true;

            });
        }

        return true;

    });

    return true;
}

module.exports = mapzen;

