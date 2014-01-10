/* jslint node: true */
'use strict';

var log = require('winston');
var request = require('supertest');
var async = require('async');

var contactsUploaded = require('./data/contacts-uploaded.json');
var contactsScheme = require('./data/scheme.json');
var customersImported = require('./data/customers-imported.json');
var customersImportedMask = require('./data/customers-imported-mask.json');

var currentUserName = 'user1';
var currentUserPassword = 'password1';

//Auth
function getAuthHeader(userData){
	var userDataHash = new Buffer(userData).toString('base64');
	return {
		'Authorization':'Basic '+ userDataHash
	};
}

//Database
function dropDatabase(cb){
	db.dropDatabase(function (err){
		if(err) throw err;
		log.info('Test database has been dropped');
		cb();
	});
}

function dropDatabaseAnd(fn){
	return function(done){
		dropDatabase(function(){
			fn(done);
		});
	};
}

function getDebitoorToken(cb){
	db.collection('users',function(err,collection){
		if(err) return cb(err);
		
		collection.findOne({
			'username': currentUserName
		},
		function (err, doc) {
			if(err) return cb(err);

			if(doc === null){
				return cb('Token was not found');
			}

			cb(null, doc.debitoortoken);
		});
	});
}

//Debitoor
function cleanCustomers(done){
	readCustomers(done, function(customers, token){
		var tasks = customers.map(function(item){
			return function(cb){
				deleteCustomer(token, item, cb);
			};
		});

		async.parallel(
			tasks,
			function(err){
				if(err) return done(err);
				done();
		});
	});
}

function deleteCustomer(token, customer, cb){
		customer.isArchived = true;
		updateCustomer(token, customer, cb);
}

function updateCustomer(token, customer, cb){
	request(config.debitoor.api.customersURL)
		.put('/'+customer.id)
		.send(customer)
		.set('x-token', token)
		.end(function(err){
			if(err) return cb(err);
			log.info('Updated: ' + customer.email);
			cb();
		});
}

function readCustomers(done, cb){
	getDebitoorToken(function (err, token){
		if(err) return done(err);
		request(config.debitoor.api.customersURL)
			.get('')
			.set('x-token', token)
			.end(testResponse(done, function(res){
				var customers = res.body.filter(function(customer){
						return !customer.isArchived;
				});
				cb(customers, token);
			}));
	});
}

function modifyCustomers(done, cb){
	readCustomers(done, function(customers, token){
		var tasks = [];
		
		var deletedCustomer = customers[0];
		var updatedCustomer = customers[1];
		updatedCustomer.name = 'UPDATED NAME';

		tasks.push(function(callback){
			deleteCustomer(token, deletedCustomer, callback);
		});
		
		tasks.push(function(callback){
			updateCustomer(token, updatedCustomer, callback);
		});
		
		async.parallel(
			tasks,
			function(err){
				if(err) return done(err);

				cb(deletedCustomer, updatedCustomer);
		});
	});
}

//Mocha will not show error in the console, and test will shut down
//if we directly throw exception in the ".end()" function of "supertest".
//This function wrap the handling of error 
//for correct pass the error in the ".done()" function. 
function testResponse(done, cb) {
	return function (err,res) {
		if(err) return done(err);

		try{
			cb(res, done);
		}catch(error){
			return done(error);
		}
	};
}

function testBody(done, cb) {
	return testResponse(done, function(res){
		cb(res.body);
		done();
	});
}

var db = null;
var config = null;
function setup(url, database, configuration){
	var server = request(url);

	db = database;
	config = configuration;
	exports.server = server;
}

exports.setup = setup;
exports.dropDatabase = dropDatabase;
exports.dropDatabaseAnd = dropDatabaseAnd;

exports.cleanCustomers = cleanCustomers;
exports.readCustomers = readCustomers;
exports.modifyCustomers = modifyCustomers;

exports.contactsScheme = contactsScheme;
exports.contactsUploaded = contactsUploaded;
exports.contactsToUpload = 'test/data/contacts.csv';
exports.customersImported = customersImported;
exports.customersImportedMask =  customersImportedMask;

exports.auth =  getAuthHeader(currentUserName+':'+currentUserPassword);
exports.authAnother =  getAuthHeader('user2:password2');
exports.authWrong = getAuthHeader('u:u');

exports.testBody = testBody;
exports.testResponse = testResponse;