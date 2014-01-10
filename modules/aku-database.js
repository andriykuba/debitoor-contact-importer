/* jslint node: true */
'use strict';

var config = require('../modules/aku-config');
var log = require('winston');
var mongoose = require('mongoose');

function setup(cb){
	mongoose.connection.on('connected', function () {
		log.info('Mongoose default connection open to ' + config.db.URI);
		cb(mongoose.connection.db);
	});
	
	mongoose.connection.on('error',function (err) {
		log.info('Mongoose default connection error: ' + err);
	});

	mongoose.connection.on('disconnected', function () {
		log.info('Mongoose default connection disconnected');
	});

	process.on('SIGINT', function() {
		mongoose.connection.close(function () {
			console.log('App terminated. Mongoose disconnected');
			process.exit(0);
		});
	});

	mongoose.connect(config.db.URI);
}

var USER = mongoose.model('User', new mongoose.Schema({
		'username': 'String',
		'debitoortoken': 'String',
		'registered': 'Date'
	},
	{collection: 'users'})
);

var CONTACT = mongoose.model('Contact', new mongoose.Schema({
		'username': 'String',
		'contact': {}
	},
	{collection: 'contacts'})
);

var SCHEMEMAP = mongoose.model('Schememap', new mongoose.Schema({
		'username': 'String',
		'schememap': {}
	},
	{collection: 'schememaps'})
);

function readContacts (username, cb){
	var query = CONTACT.find({username:username},'contact');
	query.exec(function (err, docs) {
		if(err){
			return cb(err);
		}

		var contacts = docs
		.filter(function(doc){
			return doc.contact!==null;
		})
		.map(function(doc){
			return doc.contact;
		});

		cb(null, contacts);
	});
}


function readSchememap (username, cb){
	var query = SCHEMEMAP.findOne({username:username},'schememap');
	query.exec(function (err, doc) {
		if(err){
			cb(err);
			return;
		}

		if(doc === null){
			cb(null, null);
			return;
		}

		cb(null, doc.schememap);
	});
}

exports.setup = setup;
exports.USER = USER;
exports.CONTACT = CONTACT;
exports.SCHEMEMAP = SCHEMEMAP;

exports.readContacts = readContacts;
exports.readSchememap = readSchememap;
