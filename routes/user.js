/* jslint node: true */
'use strict';

var express = require('express');
var config = require('../modules/aku-config');
var log = require('../modules/aku-log');
var db = require('../modules/aku-database');

function fetch(req, res, next){
	var username = req.user;

	db.USER.findOne({username: username}, function(err, userdata){
		if(err) return next(err);
		
		if(userdata === null){
			
			userdata = new db.USER({
				username: username,
				registered: Date.now()
			});

			userdata.save(function(err) {
				if(err) return next(err);

				log.info('User has been created: ' + username);
				req.userdata = userdata;
				return next();
			});
		}else{
			req.userdata = userdata;
			return next();
		}
	});
}

var userMapper = null;
function createUserMaper(){
	var userMap = {};
	
	for (var i = 0; config.users.length > i; i += 1) {
			userMap[config.users[i].name] = config.users[i];
	}

	return function(username) {
		return userMap[username];
	};
}

function setup(){
	userMapper = createUserMaper();
}

exports.setup = setup;
exports.fetch = fetch;
exports.auth = express.basicAuth(function(username, pass) {
	var user = userMapper(username);
	return user && user.password === pass;
});
