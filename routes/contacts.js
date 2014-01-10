/* jslint node: true */
'use strict';

var uploader = require('../modules/aku-uploader');
var jsonUtil = require('../modules/aku-json');
var db = require('../modules/aku-database');
var csv = require('csv');
var log = require('winston');

function get (req, res, next){
	db.readContacts(req.user, function(err, contacts){
		if(err) {
			next(err);
			return;
		}

		res.send(contacts);
	});
}

function parseCSV(CSVData, username, cb){
	var recordsStill = 0;
	var isAllCommited = false;

	function tryEnd(){
		if(isAllCommited && recordsStill===0){
			cb();
		}
	}

	csv()
	.from.string(CSVData,{
		columns: true
	})
	.on('record', function(row){
		var doc = jsonUtil.trim(row);

		var contact = new db.CONTACT({
			username:username,
			contact:doc
		});

		recordsStill++;
		contact.save(function (){
			recordsStill--;
			tryEnd();
		});
	})
	.on('end', function(count){
		log.info('Number of contacts: '+count);
		isAllCommited = true;
		tryEnd();
	});
}

function cleanAndSave(CSVData, username, cb){
	db.CONTACT.find({username:username}).remove(function (){
		parseCSV(CSVData, username, cb);
	});
}

function post(req, res, next){
	var username = req.user;
	var singleTextFile = new uploader.SingleTextFile();

	singleTextFile.on('done', function(CSVData){
		if(CSVData === null){
			next('CSVData is null');
		}else{
			cleanAndSave(CSVData, username, function(){
				res.send({
					'complete': true
				});
			});
		}
	});

	singleTextFile.read(req);
}

exports.get = get;
exports.post = post;