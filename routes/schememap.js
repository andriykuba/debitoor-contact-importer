/* jslint node: true */
'use strict';

var log = require('winston');
var db = require('../modules/aku-database');

function get (req, res, next){
	db.readSchememap(req.user, function(err, schememap){
		if(err){
			next(err);
			return;
		}

		if(schememap === null){
			log.info('Contact scheme was not found');
			res.send(404, 'contact scheme was not found');
			return;
		}

		res.send(schememap);
	});
}

function find (username, cb){
	db.SCHEMEMAP.findOne({username:username},'schememap', cb);
}

function put (req, res, next){
	if (typeof req.body === 'undefined'){
		return next('Scheme was not send');
	}

	var username = req.user;
	find(username, function (err, doc) {
		if(err) return next(err);
	
		if(doc === null){
			doc = new db.SCHEMEMAP({
				username: username
			});
		}
	
		doc.schememap = req.body;
	
		doc.save(function(err) {
			if(err) return next(err);
			
			log.info('Schememap has been saved');
			res.send({
				'complete': true
			});
		});
	});
}

exports.get = get;
exports.put = put;