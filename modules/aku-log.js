/* jslint node: true */
'use strict';

var winston = require('winston');

function setup(){
	winston.add(winston.transports.File, { filename: __dirname+'/../log/server.log' });
	
	winston.handleExceptions(
		new winston.transports.File({
			filename: __dirname+'/../log/serverexceptions.log'
		}));
}

exports.setup = setup;
exports.info = winston.info;
exports.error = winston.error;