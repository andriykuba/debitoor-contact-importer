/* jslint node: true */
'use strict';

var log = require('winston');
var jsonUtil = require('../modules/aku-json');
var priv = require('../config/private.json');
var pub = require('../config/public.json');

function setup(env){
	log.info('Environment: ' + env);

	var config = {};
	jsonUtil.merge(config, pub);
	jsonUtil.merge(config, priv);
	
	if(config.env){
		var currentConf = config.env[env];
		jsonUtil.merge(config, currentConf);
		//delete to avoid wrong use 
		delete config.env;
	}

	jsonUtil.merge(exports, config);
}

exports.setup = setup;