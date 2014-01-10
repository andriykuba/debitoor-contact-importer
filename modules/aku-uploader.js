/* jslint node: true */
'use strict';

var log = require('winston');
var multiparty = require('multiparty');
var stream = require('stream');
var events = require('events');
var util = require('util');

var SingleTextFile = function () {
	events.EventEmitter.call(this);
	this.fileData = null;
};
util.inherits(SingleTextFile, events.EventEmitter);

SingleTextFile.prototype.read = function(req){
	var self = this;
	var form = new multiparty.Form();

		form.on('part', function(data){
			if (!data.filename){
				return;
			}
			self.streamToString(data);
		});
	form.on('close', function(){
		self.emit('done', self.fileData);
	});
	form.parse(req);
};

SingleTextFile.prototype.streamToString = function(readable){
	var self = this;
	this.fileData ='';
	var writestream = new stream();
	writestream.writable = true;
	writestream.write = function (chunk) {
		self.fileData += chunk;
		return true;
	};
	writestream.end = function () {
		log.info('File has been uploaded');
	};

	readable.pipe(writestream);
};

exports.SingleTextFile = SingleTextFile;