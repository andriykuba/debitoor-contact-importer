/* jslint node: true */
/* jshint expr: true*/
/* global describe, it*/
'use strict';

require('should');

var string = require('../modules/aku-string');
var json = require('../modules/aku-json');

describe('string', function(){
	it('should be full trimmed', function(){
		string.fulltrim(' a b   c ').should.eql('a b c');
	});
});

describe('json', function(){
	it('should be trimmed', function(){
		json.trim({
			'a':'',
			'b':'valb',
			'c':'',
			'd':'',
			'e':'vale'
		}).should.eql({
			'b':'valb',
			'e':'vale'
		});
	});

	it('should be merged', function(){
		json.merge({
			'a':'vala',
			'b':{
				'b1':'valb1'
			}
		},{
			'c':'valc',
			'b':{
				'b2':'valb2'
			}
		}).should.eql({
			'a':'vala',
			'b':{
				'b1':'valb1',
				'b2':'valb2'
			},
			'c':'valc'
		});
	});
});