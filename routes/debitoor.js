/* jslint node: true */
'use strict';

var log = require('winston');
var request = require('request');
var async = require('async');

var config = require('../modules/aku-config');
var db = require('../modules/aku-database');
var akuString = require('../modules/aku-string');

function getAuthOptions(code){
	return {
		url:config.debitoor.tokenURL,
		json:{
			client_secret: config.debitoor.clientSecret,
			code: code,
			redirect_uri: config.debitoor.callbackURL
		},
		method: 'POST',
		followRedirect: false
	};
}

function updateToken(token, req, res, next){
	req.userdata.debitoortoken = token;

	req.userdata.save(function(err) {
		if(err){
			next(err);
			return;
		}

		log.info('Debitoor token has been saved');
		res.send({
			'complete': true
		});
	});
}

function register(req, res, next){
	var wasCodeSend =
				typeof req.body === 'undefined' &&
				typeof req.body.code === 'undefined';

	if (wasCodeSend){
		return next('Debitoor code was not send');
	}

	request(getAuthOptions(req.body.code),
		function (err, response, body) {
			if(err){
				return next(err);
			}

			if(response.statusCode != 200){
				return next('Debitoor respone code: ' + response.statusCode);
			}

			if(typeof body.access_token === 'undefined'){
				return next('access_token is undefined');
			}

			updateToken(body.access_token, req, res, next);
	});
}

function readCustomers(req, cb){
	var url = config.debitoor.api.customersURL;
	var token = req.userdata.debitoortoken;

	request({
		url:url,
		json:true,
		headers:{
			'x-token': token
		}
	},function (err, response, body) {
		if(err){
			cb(err);
			return;
		}

		if(response.statusCode != 200){
			cb('Debitoor respone code: ' + response.statusCode);
			return;
		}

		//"isArchived" means not available for user
		//so we need to filter this customers 
		var customers = body.filter(function(customer){
			return !customer.isArchived;
		});

		cb(null, customers);
	});
}

var CustomersImporter = function () {
	this.token = null;
	this.mergeRule = null;
};

CustomersImporter.prototype.mapContact = function(schememap, contact){
	function mapContact(field){
		return contact[field];
	}

	var customer = {};
	for (var x in schememap) {
		var item =  schememap[x];
		var isMappable = typeof item.map !== 'undefined';
		var isObligatory = typeof item.default !== 'undefined';

		var value = null;
		if(isMappable){
			var isDelimeterPresent = typeof item.delimeter !== 'undefined';
			var delimeter = isDelimeterPresent ? item.delimeter : ',';


			value = item.map.map(mapContact).join(delimeter);
			value = akuString.fulltrim(value);
			if(value === ''){
				value = null;
			}
		}

		if(value === null && isObligatory){
			value = item.default;
		}

		if(value !== null){
			customer[x] = value;
		}
	}
	return customer;
};

CustomersImporter.prototype.detectMergeRule = function(req){
	//we assume that email is contact id. so "update" and "ignore" merge 
	//using the contact\customer email field for authentication
	var mergeRules = ['add', 'update', 'ignore'];
	var mergeRuleDefault = mergeRules[0];

	var body = req.body || {};
	var mergeRule = body.mergeRule || mergeRuleDefault;

	if(mergeRules.indexOf(mergeRule)<0){
		mergeRule = mergeRuleDefault;
	}

	return mergeRule;
};

CustomersImporter.prototype.customerUpdate = function(customer, id, cb){
	var url = config.debitoor.api.customersURL+'/'+id;
	this.customerSend(customer, url, 'PUT', cb);
};

CustomersImporter.prototype.customerCreate = function(customer, cb){
	var url = config.debitoor.api.customersURL+'?autonumber=true';
	this.customerSend(customer, url, 'POST', cb);
};

CustomersImporter.prototype.customerSend = function(customer, url, method, cb){
	request({
		url:url,
		json:customer,
		method: method,
		headers:{
			'x-token': this.token
		}
	},function (err, response, body) {
		if(err){
			cb(err);
			return;
		}

		if(response.statusCode != 200){
			cb('Debitoor respone code on '+customer.email+':'+response.statusCode);
			return;
		}

		log.info('send: ' + customer.email + '('+customer.name+')');
		cb(null, body);
	});
};

CustomersImporter.prototype.customerCreateTask = function(){
	var self = this;
	return function(contact){
		return function(callback){
			self.customerCreate(contact, callback);
		};
	};
};

CustomersImporter.prototype.createCustomerEmailMapper = function(customers){
	var customersMap = {};
	for (var i = 0; customers.length > i; i += 1) {
		if(typeof customers[i].email !== 'undefined'){
			customersMap[customers[i].email] = customers[i];
		}
	}

	return function(email) {
		return customersMap[email];
	};
};

CustomersImporter.prototype.createTasksMergeUpdate = function(data, contacts){
	var self = this;
	var customerMapper = this.createCustomerEmailMapper(data.customers);

	var update = [];
	var tasks = contacts
		.filter(function(contact){
				if(!contact.email) return true;
				var customer = customerMapper(contact.email);
				
				var isPresent = typeof customer !== 'undefined';
				if(isPresent){
					var isDifferent = false;
					for(var x in contact){
						if(customer[x] !== contact[x]){
							customer[x] = contact[x];
							isDifferent = true;
						}
					}

					if(isDifferent){
						log.info('to update: '+contact.email);
						update.push(function (callback){
							self.customerUpdate(customer, customer.id, callback);
						});
					}
				}

				return !isPresent;
		})
		.map(this.customerCreateTask());
	return tasks.concat(update);
};

CustomersImporter.prototype.createTasksMergeIgnore = function(data, contacts){
	var customerMapper = this.createCustomerEmailMapper(data.customers);

	var tasks = contacts
		.filter(function(contact){
				if(!contact.email) return true;
				var customer = customerMapper(contact.email);
				
				var isPresent = typeof customer !== 'undefined';
				if(isPresent){
					log.info('ignored: '+contact.email);
				}

				return !isPresent;
		})
		.map(this.customerCreateTask());

	return tasks;
};

CustomersImporter.prototype.importContacts = function(data, cb){
	var self = this;
	var contacts = data.contacts.map(function(contact){
		return self.mapContact(data.schememap, contact);
	});

	var tasks = [];
	switch(this.mergeRule){
		case 'add':
			tasks = contacts.map(this.customerCreateTask());
			break;
		case 'update':
			tasks = this.createTasksMergeUpdate(data, contacts);
			break;
		case 'ignore':
			tasks = this.createTasksMergeIgnore(data, contacts);
			break;
		default:
			cb('No such merge Rule:' + this.mergeRule);
	}

	async.parallel(
		tasks,
		function(err){
			if(err){
				cb(err);
				return;
			}
			cb();
	});
};

CustomersImporter.prototype.process = function(req, res, next){
	this.token = req.userdata.debitoortoken;
	this.mergeRule = this.detectMergeRule(req);

	var tasks = {
		schememap: function(cb){
			db.readSchememap(req.user, cb);
		},
		contacts: function(cb){
			db.readContacts(req.user, cb);
		}
	};

	if(this.mergeRule !== 'add'){
		this.customerIdUrlPart = config.debitoor.api.customersURL + '/';
		this.tokenUrlPart = '?token=' + req.userdata.debitoortoken;

		tasks.customers = function(cb){
			readCustomers(req, cb);
		};
	}

	var self = this;
	async.parallel(
		tasks,
		function(err, data){
			if(err){
				next(err);
				return;
			}

			self.importContacts(data, function(err){
				if(err){
					next(err);
					return;
				}
				
				res.send({
					'complete': true
				});
			});
		});
};

function customersImport(req, res, next){
	var importer = new CustomersImporter();
	importer.process(req, res, next);
}

exports.register = register;
exports.customersImport = customersImport;