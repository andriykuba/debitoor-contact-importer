/* jslint node: true */
'use strict';

function fulltrim(str){
	return str.replace(/(?:(?:^|\n)\s+|\s+(?:$|\n))/g,'').replace(/\s+/g,' ');
}

exports.fulltrim = fulltrim;