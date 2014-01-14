/* jslint node: true */
/* jshint expr: true*/
/* global describe, it, before*/
'use strict';

//Setup

//NODE_ENV must be  set before exporting app
process.env.NODE_ENV = 'test';

//Accept self signed sertificate. Trivial sertificate for testing
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var request = require('supertest');
var url = require('url');
var cheerio = require('cheerio');
var Q = require('q');

var app = require('../server');
var tools = require('./tools');
require('should');

//Tests
var config = null;
before(function(done){
	//in the case of call request(app) "ephemeral port" would be used
	//"ephemeral port" will pass test even if server listener was not been created
	//it's bad because does not detect wrong listener call.
	
	//database could be still not connected before test starts
	//we use special "startApp" wrapper to be sure -
	//all the application modules is ready for action

	function startTests(err, data){
		if(err) throw err;

		config = data.config;
		
		tools.setup(data.serverurl, data.database, config);
		tools.dropDatabase(done);
	}

	app.startApp(startTests);
});

describe('site', function(){
	it('home page responds', function(done){
		 tools
			.server
			.get('/')
			.expect(200, done);
	});
});

describe('authentication', function(){
	it('the user authenticated', function(done){
		 tools
			.server
			.get('/api/v1.0/contacts')
			.set(tools.auth)
			.expect(200, done);
	});

	it('the user is wrong', function(done){
		 tools
			.server
			.get('/api/v1.0/contacts')
			.set(tools.authWrong)
			.expect(401, done);
	});
});

describe('/api/v1.0/contacts', function(){
	it('POST respond ok', function(done){
		 tools
			.server
			.post('/api/v1.0/contacts')
			.set(tools.auth)
			.attach('file', tools.contactsToUpload)
			.expect(200)
			.end(tools.testResponse(function(err, res) {
				if(err) return done(err);

				res.body.should.have.property('complete');
				res.body.complete.should.be.true;

				done();
			}));
	});

	it('GET return all posted contacts', function(done){
		 tools
			.server
			.get('/api/v1.0/contacts')
			.set(tools.auth)
			.expect(200)
			.end(tools.testResponse(function(err, res) {
				if(err) return done(err);

				var contactsLength = tools.contactsUploaded.length;
				res.body.should.be.instanceof(Array).and.have.lengthOf(contactsLength);

				tools.contactsUploaded.forEach(function(item){
					res.body.should.includeEql(item);
				});

				done();
			}));
	});

	it('GET no contacts for another user', function(done){
		 tools
			.server
			.get('/api/v1.0/contacts')
			.set(tools.authAnother)
			.expect(200)
			.end(tools.testResponse(function(err, res) {
				if(err) return done(err);

				res.body.should.be.instanceof(Array).and.have.lengthOf(0);

				done();
			}));
	});
});

describe('/api/v1.0/schememap', function(){
	it('PUT respond ok', function(done){
		 tools
			.server
			.put('/api/v1.0/schememap')
			.set(tools.auth)
			.send(tools.contactsScheme)
			.expect(200)
			.end(tools.testResponse(function(err, res) {
				if(err) return done(err);

				res.body.should.have.property('complete');
				res.body.complete.should.be.true;

				done();
			}));
	});

	it('GET return posted scheme', function(done){
		 tools
			.server
			.get('/api/v1.0/schememap')
			.set(tools.auth)
			.expect(200)
			.end(tools.testResponse(function(err, res) {
				if(err) return done(err);

				res.body.should.be.eql(tools.contactsScheme);

				done();
			}));
	});
});

describe('Debitoor', function(){
	//a lot of request, default timeout 2000ms is too small
	this.timeout(15000);

	it('register with oAuth 2.0 and save token', function(done){
		tools
			.server
			.get('/auth')
			.expect(302)
			//TODO
			.end(tools.testResponse(function(err, res){
				if(err) return done(err);
				processImporterRedirect(res, done);
			}));
	});

	function processImporterRedirect(res, cb){
		var redirectUrl = res.header.location;
		redirectUrl.should.include('debitoor');

		request(redirectUrl)
			.get('')
			.expect(200)
			.end(tools.testResponse(function(err, res){
				if(err) return cb(err);

				submitDebitoorRegistration(redirectUrl, res, cb);
			}));
	}

	function submitDebitoorRegistration(redirectUrl, res, cb){
		//this code depends form Debitoor page
		//it could be changed in any time independend from this application
		//so be careful
		res.text.should.include('form');
		res.text.should.include('authorize');
		res.text.should.include('lang');
		res.text.should.include('email');
		res.text.should.include('password');
		res.text.should.include('submit');
		
		var $ = cheerio.load(res.text);
		
		var authorizeKey = $('[name=authorize]').val();
		var lang = $('[name=lang]').val();
		var email = config.debitoor.user.name;
		var password = config.debitoor.user.password;

		var form = {
			'email': email,
			'password': password,
			'authorize': authorizeKey,
			'lang': lang
		};

		request(redirectUrl)
			.post('')
			.type('form')
			.send(form)
			.expect(302)
			.end(tools.testResponse(function(err, res){
				if(err) return cb(err);
				processDebitoorRedirect(res, cb);
			}));
	}

	function processDebitoorRedirect(res, cb){
		var redirectUrl = res.header.location;
		redirectUrl.should.include('code');
		
		var parsedUrl = url.parse(redirectUrl, true);
		var code = parsedUrl.query.code;
		
		tools
			.server
			.post('/api/v1.0/debitoor/register')
			.set(tools.auth)
			.send({'code':code})
			.expect(200)
			.end(tools.testResponse(function(err, res) {
				if(err) return cb(err);

				res.body.should.have.property('complete');
				res.body.complete.should.be.true;

				cb();
			}));
	}

	describe('import', function(){
		before(function(done){
			tools
				.cleanCustomers()
				.then(function(){
					done();
				})
				.fail(done);
		});

		it('all contacts as new customers', function(done){
			importContacts('add')
				.then(function(res){
					checkImportedContactsEquals(res, done);
				})
				.fail(done);
		});

		function importContacts(mergeRule){
			var deferred = Q.defer();

			tools
				.server
				.post('/api/v1.0/debitoor/customers/import')
				.set(tools.auth)
				.send({'mergeRule':mergeRule})
				.expect(200)
				.end(tools.promiseErrRes(deferred));

			return deferred.promise;
		}

		function maskCustomer(customer){
			var masked = {};
			tools.customersImportedMask.forEach(function(field){
				if(typeof customer[field] !== 'undefined'){
					masked[field] = customer[field];
				}
			});
			return masked;
		}

		function checkImportedContacts(res, cb){
			res.body.should.have.property('complete');
			res.body.complete.should.be.true;
			
			tools
				.readCustomers()
				.then(function(debitoor){
					var customers = debitoor.customers;

					var customersLength = tools.customersImported.length;
					customers.should.be.instanceof(Array).and.have.lengthOf(customersLength);

					//Debitoor add some data to our import
					//We need to rid of that data to correct check
					var customersMasked = customers.map(maskCustomer);
					
					cb(null, customersMasked);
				})
				.fail(function(err){
					cb(err);
				});
		}

		function checkImportedContactsEquals(res, cb){
			checkImportedContacts(res, function(err, customers){
				if(err) return cb(err);

				tools.customersImported.forEach(function(item){
						customers.should.includeEql(item);
				});

				cb();
			});
		}

		function checkImportedContactsDifferent(modifyed, res, cb){
			checkImportedContacts(res, function(err, customers){
				if(err) return cb(err);

				customers.should.includeEql(maskCustomer(modifyed.updated));
				customers.should.includeEql(maskCustomer(modifyed.deleted));

				cb();
			});
		}

		it('new customers or update present customers', function(done){
			tools
				.modifyCustomers()
				.then(function(){

					importContacts('update')
						.then(function(res){
							checkImportedContactsEquals(res, done);
						})
						.fail(done);

				})
				.fail(done);
		});

		it('only contacts that is not present as customers', function(done){
			tools
				.modifyCustomers()
				.then(function(modifyed){

					importContacts('ignore')
						.then(function (res){
							checkImportedContactsDifferent(modifyed, res, done);
						})
						.fail(done);

				})
				.fail(done);
		});

	});
});