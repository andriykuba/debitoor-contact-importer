/* jslint node: true */
'use strict';

var config = require('../modules/aku-config');

function index(req, res){
	res.render('index', {
		title: 'Debitoor Contact Importer',
		login:{
			link: 'Grant access to Debitoor',
			code: 'Copy and paste this code in the "/api/v1.0/debitoor/register" API request'
		}
	});
}

function auth(req, res){
	var url = config.debitoor.authorizationURL+
		'?client_id='+config.debitoor.clientID+
		'&response_type=code'+
		'&redirect_uri='+config.debitoor.redirectUrl;

	res.writeHead(302, {'Location': url});
	res.end();
}

exports.index = index;
exports.auth = auth;