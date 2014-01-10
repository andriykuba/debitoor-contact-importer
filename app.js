/* jslint node: true */
'use strict';

var app = require('./server');

app.startApp(function (err){
	if(err){
	//this error was not processed by app, so app must be stoped
		throw err;
	}
});