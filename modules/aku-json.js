/* jslint node: true */
'use strict';

function trim(jsonObject){
	for (var x in jsonObject) {
		if ( Object.prototype.hasOwnProperty.call(jsonObject,x)) {
			var y = jsonObject[x];
			if (y==='null' || y===null || y==='' || typeof y === 'undefined') {
				delete jsonObject[x];
			}
		}
	}
	return jsonObject;
}

function merge(obj1, obj2) {
	for (var p in obj2) {
		try {
			if ( obj2[p].constructor===Object ) {
				obj1[p] = merge(obj1[p], obj2[p]);
			} else {
				obj1[p] = obj2[p];
			}
		} catch(e) {
			obj1[p] = obj2[p];
		}
	}
	return obj1;
}

exports.trim = trim;
exports.merge = merge;