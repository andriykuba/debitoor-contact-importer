/* jslint node: true */
'use strict';

var async = require('async');
var express = require('express');
var https = require('https');
var path = require('path');
var fs = require('fs');

var site = require('./routes/site');
var user = require('./routes/user');
var debitoor = require('./routes/debitoor');
var contacts = require('./routes/contacts');
var schememap = require('./routes/schememap');

var config = require('./modules/aku-config');
var log = require('./modules/aku-log');
var db = require('./modules/aku-database');

var app = express();

//modules setup
log.setup();
config.setup(app.get('env'));
user.setup();

//app setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.json());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

//errors
app.use(function(err, req, res, next) {
	//hook for pass jslint 
	//generally, it's express issue, 
	//it must set error handler as app.useError(...) or similar
	if(!err) return next();

	log.error(err.stack || err);
	res.send(500, err.message || err);
});

//routes
app.get('/', site.index);
app.get('/auth', site.auth);

//api routes
app.get('/api/v1.0/contacts',
	user.auth,
	contacts.get);

app.post('/api/v1.0/contacts',
	user.auth,
	contacts.post);

app.get('/api/v1.0/schememap',
	user.auth,
	schememap.get);

app.put('/api/v1.0/schememap',
	user.auth,
	schememap.put);

app.post('/api/v1.0/debitoor/customers/import',
	user.auth,
	user.fetch,
	debitoor.customersImport);

app.post('/api/v1.0/debitoor/register',
	user.auth,
	user.fetch,
	debitoor.register);


function startServer(cb){
	var options = {
  	key: fs.readFileSync('config/key/key.pem'),
  	cert: fs.readFileSync('config/key/cert.pem')
	};

	https.createServer(options, app).listen(config.app.port, config.app.host, function(){
		var serverUrl = 'https://'+config.app.host+':'+config.app.port;
		log.info('Express server run on: ' + serverUrl);
		cb(null, serverUrl);
	});
}

function startDatabase(cb){
	db.setup(function(database){
		cb(null, database);
	});
}

//for easy work with APP outside, for example run app in the test framework 
function startApp(cb){
	async.parallel(
		{
			'server':startServer,
			'database':startDatabase
		},
		function(err, data){
			if(err){
				log.error(err);
				cb(err);
			}

			var appData ={
				'database': data.database,
				'serverurl': data.server,
				'config': config
			};

			log.info('All Components ready to action.');
			cb(null, appData);
		}
	);
}

exports.startApp = startApp;