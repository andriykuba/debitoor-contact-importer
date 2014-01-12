/* jslint node: true */
'use strict';

var log = require('winston');
var request = require('request');
var async = require('async');
var events = require('events');
var util = require('util');

var config = require('../modules/aku-config');
var db = require('../modules/aku-database');
var akuString = require('../modules/aku-string');

var CustomersImporter = function () {
	events.EventEmitter.call(this);
	this.token = null;
	this.mergeRule = null;
};
util.inherits(CustomersImporter, events.EventEmitter);

CustomersImporter.prototype.mapContacts = function(contacts, schememap){

	function mapContact (contact){
		var customer = {};
		for (var x in schememap) {
			var item =  schememap[x];
			var isMappable = typeof item.map !== 'undefined';
			var isObligatory = typeof item.default !== 'undefined';

			var value = null;
			if(isMappable){
				value = mapContactValue(item, contact);
			}

			if(value === null && isObligatory){
				value = item.default;
			}

			if(value !== null){
				customer[x] = value;
			}
		}
		return customer;
	}

	function mapContactValue(item, contact){
		var delimeter = item.delimeter || ',';

		var value = item.map.map(function(field){
			return contact[field];
		}).join(delimeter);

		value = akuString.fulltrim(value);
		if(value === ''){
			return null;
		}
		return value;
	}

	var mappedContacts  = contacts.map(function(item){
		return mapContact(item);
	});
	return mappedContacts;
};

CustomersImporter.prototype.detectMergeRule = function(req){
	//we assume that email is contact id. so "update" and "ignore" merge 
	//using the contact\customer email field for authentication
	var mergeRules = ['add', 'update', 'ignore'];
	var mergeRuleDefault = mergeRules[0];

	var body = req.body || {};
	var mergeRule = body.mergeRule || mergeRuleDefault;

	if(mergeRules.indexOf(mergeRule)<0){
		log.info(
			'there is no merge rule:'+mergeRules+
			', default'+mergeRuleDefault+'is set');

		mergeRule = mergeRuleDefault;
	}

	log.info('merge rule: ' + mergeRule);
	
	return mergeRule;
};

CustomersImporter.prototype.customerUpdate = function(customer, cb){
	var url = config.debitoor.api.customersURL+'/'+customer.id;
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
		if(err) return cb(err);

		if(response.statusCode != 200){
			err = new Error(
				'Debitoor respone code on '+
				customer.email+':'+
				response.statusCode);

			return cb(err);
		}

		log.info('send: ' + customer.email + '('+customer.name+')');
		cb(null, body);
	});
};

CustomersImporter.prototype.customerCreateTask = function(){
	//this function creates tasks for "async" module within "Array.map()"
	var self = this;
	return function(contact){
		return function(callback){
			//actually we do "create customer" task
			log.info('To create: '+contact.email);
			self.customerCreate(contact, callback);
		};
	};
};

CustomersImporter.prototype.createCustomerEmailMapper = function(customers){
	var customersMap = {};

	customers.filter(function(customer){
		return typeof customer.email !== 'undefined';
	}).forEach(function(customer){
		customersMap[customer.email] = customer;
	});

	return function(email) {
		return customersMap[email];
	};
};

CustomersImporter.prototype.filterPresentContacts = function(customers, presentProcessor){
	var customerMapper = this.createCustomerEmailMapper(customers);

	return function(contact){
		//We can not check that contact is present as a customer 
		//if the contact has no an email item.
		//So we calcualte the contact as new.
		if(!contact.email) return true;

		var customer = customerMapper(contact.email);
		var isPresent = (typeof customer !== 'undefined');

		if(isPresent){
			log.info('Already present: '+contact.email);
			if(typeof presentProcessor !== 'undefined'){
				presentProcessor(contact, customer);
			}
		}

		return !isPresent;
	};
};


CustomersImporter.prototype.createTasksMergeUpdate = function(customers, contacts){
	var self = this;

	var update = [];
	var tasks = contacts
		.filter(this.filterPresentContacts(customers, function(contact, customer){
			var isDifferent = false;
			
			for(var x in contact){
				if(customer[x] !== contact[x]){
					customer[x] = contact[x];
					isDifferent = true;
				}
			}

			if(isDifferent){
				log.info('To update: '+contact.email);
				update.push(function (callback){
					self.customerUpdate(customer, callback);
				});
			}
		}))
		.map(this.customerCreateTask());
	
	return tasks.concat(update);
};

CustomersImporter.prototype.createTasksMergeIgnore = function(customers, contacts){
	var tasks = contacts
		.filter(this.filterPresentContacts(customers))
		.map(this.customerCreateTask());

	return tasks;
};

CustomersImporter.prototype.importContacts = function(data){
	var self = this;
	var contacts = this.mapContacts(data.contacts, data.schememap);

	var importTasks = [];
	switch(this.mergeRule){
		case 'add':
			importTasks = contacts.map(this.customerCreateTask());
			break;
		case 'update':
			importTasks = this.createTasksMergeUpdate(data.customers, contacts);
			break;
		case 'ignore':
			importTasks = this.createTasksMergeIgnore(data.customers, contacts);
			break;
		default:
			var err = new Error('No such merge Rule:' + this.mergeRule);
			return self.emit('error', err);
	}

	async.parallel(
		importTasks,
		function(err){
			if(err) return self.emit('error', err);
			self.emit('import');
	});
};

CustomersImporter.prototype.readCustomers = function(cb){
	var url = config.debitoor.api.customersURL;

	request({
		url:url,
		json:true,
		headers:{
			'x-token': this.token
		}
	},function (err, res, customers) {
		if(err) return cb(err);

		if(res.statusCode != 200){
			err = new Error('Debitoor respone code: ' + res.statusCode);
			cb(err);
		}
	
		//"isArchived" means not available for user
		//so we need to filter this customers 
		function isAvailable(customer){
			return !customer.isArchived;
		}

		var realCustomers = customers.filter(isAvailable);
		cb(null, realCustomers);
	});
};

CustomersImporter.prototype.process = function(req){
	this.token = req.userdata.debitoortoken;
	this.mergeRule = this.detectMergeRule(req);

	var self = this;

	var readDataForImport = {
		schememap: function(cb){
			db.readSchememap(req.user, cb);
		},
		contacts: function(cb){
			db.readContacts(req.user, cb);
		}
	};

	//we do not need to read customers from Debitoor 
	//if we just post a contacts 
	if(this.mergeRule !== 'add'){
		readDataForImport.customers = function(cb){
			self.readCustomers(cb);
		};
	}

	async.parallel(
		readDataForImport,
		function(err, dataForImport){
			if(err) return self.emit('error', err);
			self.importContacts(dataForImport);
		});
};

exports.CustomersImporter = CustomersImporter;