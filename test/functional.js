/* jslint node: true */
/* jshint expr: true*/
/* global describe, it, before*/
'use strict';

//Setup

//NODE_ENV must be  set before exporting app
process.env.NODE_ENV = 'test';

//Accept self signed sertificate. Trivial sertificate for testing
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0" 

var request = require('supertest');
var url = require('url');
var cheerio = require('cheerio');
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
			.end(tools.testBody(done, function(body) {
				body.should.have.property('complete');
				body.complete.should.be.true;
			}));
	});

	it('GET return all posted contacts', function(done){
		 tools
			.server
			.get('/api/v1.0/contacts')
			.set(tools.auth)
			.expect(200)
			.end(tools.testBody(done, function(body) {
				var contactsLength = tools.contactsUploaded.length;
				body.should.be.instanceof(Array).and.have.lengthOf(contactsLength);

				tools.contactsUploaded.forEach(function(item){
					body.should.includeEql(item);
				});
			}));
	});

	it('GET no contacts for another user', function(done){
		 tools
			.server
			.get('/api/v1.0/contacts')
			.set(tools.authAnother)
			.expect(200)
			.end(tools.testBody(done, function(body) {
				body.should.be.instanceof(Array).and.have.lengthOf(0);
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
			.end(tools.testBody(done, function(body) {
				body.should.have.property('complete');
				body.complete.should.be.true;
			}));
	});

	it('GET return posted scheme', function(done){
		 tools
			.server
			.get('/api/v1.0/schememap')
			.set(tools.auth)
			.expect(200)
			.end(tools.testBody(done, function(body) {
				body.should.be.eql(tools.contactsScheme);
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
			.end(tools.testResponse(done, processImporterRedirect));
	});

	function processImporterRedirect(res, done){
		var redirectUrl = res.header.location;
		redirectUrl.should.include('debitoor');

		request(redirectUrl)
			.get('')
			.expect(200)
			.end(tools.testResponse(done, function(res,done){
				submitDebitoorRegistration(redirectUrl, res, done);
			}));
	}

	function submitDebitoorRegistration(redirectUrl, res, done){
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
			.end(tools.testResponse(done, processDebitoorRedirect));
	}

	function processDebitoorRedirect(res, done){
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
			.end(tools.testBody(done, function(body) {
				body.should.have.property('complete');
				body.complete.should.be.true;
			}));
	}

	describe('import', function(){
		before(function(done){
			tools.cleanCustomers(done);
		});

		it('all contacts as new customers', function(done){
			importContacts(done, 'add', checkImportedContactsEquals);
		});

		function importContacts(done, mergeRule, cb){
			tools
				.server
				.post('/api/v1.0/debitoor/customers/import')
				.set(tools.auth)
				.send({'mergeRule':mergeRule})
				.expect(200)
				.end(tools.testResponse(done, cb));
		}

		function maskCustomer(cusromer){
			var masked = {};
			tools.customersImportedMask.forEach(function(field){
				if(typeof cusromer[field] !== 'undefined'){
					masked[field] = cusromer[field];
				}
			});
			return masked;
		}

		function checkImportedContacts(res, done, cb){
			res.body.should.have.property('complete');
			res.body.complete.should.be.true;
			
			tools.readCustomers(done, function(customers){
				var customersLength = tools.customersImported.length;
				customers.should.be.instanceof(Array).and.have.lengthOf(customersLength);

				//Debitoor add some data to our import
				//We need to rid of that data to correct check
				var customersMasked = customers.map(maskCustomer);
				cb(customersMasked);

				done();
			});
		}

		function checkImportedContactsEquals(res, done){
			checkImportedContacts(res, done, function(customers){
				tools.customersImported.forEach(function(item){
						customers.should.includeEql(item);
				});
			});
		}

		function checkImportedContactsDifferent(delited, updated, res, done){
			checkImportedContacts(res, done, function(customers){
				customers.should.includeEql(maskCustomer(updated));
				customers.should.includeEql(maskCustomer(delited));
			});
		}

		it('new customers or update present customers', function(done){
			tools.modifyCustomers(done, function(){
				importContacts(done, 'update', checkImportedContactsEquals);
			});
		});

		it('only contacts that is not present as customers', function(done){
			tools.modifyCustomers(done, function(delited, updated){
				importContacts(done, 'ignore', function (res){
					checkImportedContactsDifferent(delited,updated, res, done);
				});
			});
		});

	});
});