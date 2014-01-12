/* jslint node: true */
'use strict';

var log = require('winston');
var request = require('request');

var config = require('../modules/aku-config');
var debitoor = require('../modules/aku-debitoor');

function getAuthOptions(code){
	return {
		url:config.debitoor.tokenURL,
		json:{
			client_secret: config.debitoor.clientSecret,
			code: code,
			redirect_uri: config.debitoor.callbackURL
		},
		method: 'POST',
		followRedirect: false
	};
}

function updateToken(token, req, res, next){
	req.userdata.debitoortoken = token;

	req.userdata.save(function(err) {
		if(err){
			next(err);
			return;
		}

		log.info('Debitoor token has been saved');
		res.send({
			'complete': true
		});
	});
}

function register(req, res, next){
	var wasCodeSend =
				typeof req.body === 'undefined' &&
				typeof req.body.code === 'undefined';

	if (wasCodeSend){
		return next('Debitoor code was not send');
	}

	request(getAuthOptions(req.body.code),
		function (err, response, body) {
			if(err){
				return next(err);
			}

			if(response.statusCode != 200){
				return next('Debitoor respone code: ' + response.statusCode);
			}

			if(typeof body.access_token === 'undefined'){
				return next('access_token is undefined');
			}

			updateToken(body.access_token, req, res, next);
	});
}

function customersImport(req, res, next){
	var importer = new debitoor.CustomersImporter();
	importer.on('error', next);
	importer.on('import', function(){
		res.send({
			'complete': true
		});
	});
	importer.process(req);
}

exports.register = register;
exports.customersImport = customersImport;