/* jslint node: true */
'use strict';

var log = require('winston');
var request = require('supertest');
var async = require('async');
var Q = require('q');

var contactsUploaded = require('./data/contacts-uploaded.json');
var contactsScheme = require('./data/scheme.json');
var customersImported = require('./data/customers-imported.json');
var customersImportedMask = require('./data/customers-imported-mask.json');

var currentUserName = 'user1';
var currentUserPassword = 'password1';

//promises
function promiseErrRes(deferred, processor){
	return function(err,res){
		if(err){
			deferred.reject(err);
		}else if(processor){
			try{
				var processed = processor(res);
				deferred.resolve(processed);
			}catch(error){
				deferred.reject(error);
			}
		}else{
			deferred.resolve(res);
		}
	};
}

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

function getUsers(){
	var deferred = Q.defer();
	
	db.collection('users', promiseErrRes(deferred));
	
	return deferred.promise;
}

function getCurrentUser(collection){
	var deferred = Q.defer();
	
	collection.findOne({
		'username': currentUserName
	},promiseErrRes(deferred));
	
	return deferred.promise;
}

function getDebitoorToken(){
	return getUsers()
		.then(getCurrentUser)
		.get('debitoortoken');
}

//Debitoor
function cleanCustomersPromise(debitoor){
	var deferred = Q.defer();

	function deleteCustomerTask(customer){
		return function(cb){
			deleteCustomer(debitoor.token, customer, cb);
		};
	}

	var tasks = debitoor.customers.map(deleteCustomerTask);

	async.parallel(tasks, promiseErrRes(deferred));

	return deferred.promise;
}

function cleanCustomers(){
	return readCustomers().then(cleanCustomersPromise);
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
			cb();
		});
}

function readCustomersPromise(token){
	var deferred = Q.defer();

	request(config.debitoor.api.customersURL)
		.get('')
		.set('x-token', token)
		.end(promiseErrRes(deferred, filterCustomers));

	function filterCustomers(res){
		var customers = res.body.filter(ridOffDeleted);
		return {
			'customers':customers,
			'token':token
		};
	}

	function ridOffDeleted(customer){
		return !customer.isArchived;
	}

	return deferred.promise;
}

function readCustomers(){
	return getDebitoorToken().then(readCustomersPromise);
}

function modifyCustomersPromise(debitoor){
	var deferred = Q.defer();

	var tasks = [];
	
	var deletedCustomer = debitoor.customers[0];
	var updatedCustomer = debitoor.customers[1];
	updatedCustomer.name = 'UPDATED NAME';

	tasks.push(function(callback){
		deleteCustomer(debitoor.token, deletedCustomer, callback);
	});
	
	tasks.push(function(callback){
		updateCustomer(debitoor.token, updatedCustomer, callback);
	});
	
	async.parallel(
		tasks,
		promiseErrRes(deferred, returnModifiedCustomers)
		);
	
	function returnModifiedCustomers(){
		return {
			'deleted': deletedCustomer,
			'updated': updatedCustomer
		};
	}

	return deferred.promise;
}

function modifyCustomers(){
	return readCustomers().then(modifyCustomersPromise);
}

//Mocha will not show error in the console, and test will shut down
//if we directly throw exception in the ".end()" function of "supertest".
//This function wrap the handling of error 
//for correct pass the error in the ".done()" function. 
function testResponse(cb) {
	return function (err,res) {
		if(err) return cb(err);

		try{
			cb(null, res);
		}catch(err){
			return cb(err);
		}
	};
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

exports.testResponse = testResponse;

exports.promiseErrRes = promiseErrRes;