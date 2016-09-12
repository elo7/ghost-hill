'use strict';

var fs = require('fs');

const PROPERTIES_MATCH = /[^;]*;\s\/\/position:\(\d+,\d+\)/g,
	SELECTOR_MATCH = /([\.\#\w\-\:\=\[\]\'\"]+)\s?{(\n|[^}]*)}/,
	SELECTOR_ONLY_MATCH = /([\.\#\w\-\:\=\[\]\'\"]+|@function\s?([^(]+)\(.*\)|@mixin\s([^(]+)\(([^)]+)?\))?\s{/g,
	VARIABLES_MATCH = /\$([^$,;]+)/g,
	MIXINS_MATCH = /@mixin\s([^(]+)\(([^)]+)?\)\s?{([^}]+)}/,
	FUNCTIONS_MATCH = /@function\s?([^(]+)\((.*)\)\s?{([^}]+)}/,
	INCLUDE_MATCH = /@include\s?([^(]+)(.*)\s?{([^}]+)}/,
	CSS_UNIT = /([\d\.]+)(px|em|rem|vw|vh|%|pt|cm|in|mm)?/,
	UNITS = /(\d|\.|px|em|rem|vw|vh|%|pt|cm|in|mm)/g,
	STRING_REPLACEMENT_START_SYMBOL = '!STR_START!',
	STRING_REPLACEMENT_END_SYMBOL = '!STR_END!',
	POSITION_REGEX = /\s\/\/position:\((\d+),(\d+)\)/;

class SCSSParser {
	constructor(filename) {
		this.filename = filename;
		this.scss = fs.readFileSync(filename, 'UTF-8');
		if(!this.scss) {
			throw new Error('File not found.');
		}
	}

	_type(value) {
		if(!value) {
			return;
		}
		value = value.replace(new RegExp(STRING_REPLACEMENT_START_SYMBOL, 'g'), '#{').replace(new RegExp(STRING_REPLACEMENT_END_SYMBOL, 'g'), '}');
		const isHexa = value.indexOf('#') > 0,
			isRgb = value.indexOf('rgb') > 0;
		let formattedValue = {};

		if(value.indexOf(':') > -1) {
			var aux = value.split(':');
			formattedValue.name = aux[0];
			value = aux[1];
		}

		if(value.indexOf('calc') > -1) {
			formattedValue.type = 'calc';
			formattedValue.value = value.replace(/calc\s?\(/, '').replace(')', '');
		} else if(isHexa || isRgb) {
			formattedValue.type = 'COLOR';
			formattedValue.unit = isHexa? 'HEXADECIMAL' : 'RGB';
			formattedValue.value = value;
		} else if(value.indexOf('url') > 0) {
			formattedValue.type ='URL';
			formattedValue.value = value.replace(/url\(['"]?([\w\.:\/_\-\+?%&]+)['"]?\)/g);
		} else if (CSS_UNIT.test(value) && !value.replace(UNITS, '').trim()) {
			var matches = value.trim().split(' ');
			formattedValue = [];
			for(let i = 0; i < matches.length; i++) {
				let match = matches[i].match(CSS_UNIT);
				formattedValue.push({
					type: 'SIZE',
					value: match[1],
					unit: match[2]
				});
			}
		} else {
			formattedValue.type = 'string';
			formattedValue.value = value;
		}

		return formattedValue;
	}

	_parameters(rule) {
		var parameters = [];
		if(!rule) {
			return parameters;
		}
		var params = rule.split(',');
		for(var i = 0; i < params.length; i++) {
			parameters.push(this._type(params[i]));
		}
		return parameters;
	}

	_removeWhiteSpace(rule) {
		return rule.trim().replace(/\s/g, '');
	}

	_removeLineBreakAndTabs(rule) {
		return rule.trim().replace(/\\n/g, '').replace(/\\t/g, '');
	}

	_extractProperties(rule) {
		var properties = [];
		const matches = rule.match(PROPERTIES_MATCH);

		for(var i = 0; i < matches.length; i++) {
			let propertie = this._removeLineBreakAndTabs(matches[i]);
			let position = this._position(propertie),
				formattedPropertie;
			propertie = this._removePosition(propertie);
			if(propertie.indexOf('@mixin') == 0) {
				formattedPropertie = this._parseMixins.call(this, propertie);
			} else if(propertie.indexOf('@include') == 0) {
				formattedPropertie = this._parseInclude.call(this, propertie);
			} else if(propertie.indexOf('@extend') == 0) {
				formattedPropertie = this._parseExtend.call(this, propertie);
			} else {
				var name = propertie.split(":")[0].trim(),
				value = propertie.split(":")[1].replace(';', '');
				formattedPropertie = {
					'name' : name,
					'value' : this._type.call(this, value)
				};
			}
			formattedPropertie.line = position.line;
			formattedPropertie.col = position.col;
			properties.push(formattedPropertie);
		}
		return properties;
	}

	_parseInclude(rule) {
		let match = rule.replace('@include', '').replace(/(\);|;)/g, '').split('('),
			name = match[0].trim()
		return {
			'name' : name,
			'parameters' : match[1]? this._parameters.call(this, match[1]) : [],
			'type' : 'INCLUDE'
		};
	}

	_parseExtend(rule) {
		var match = rule.replace('@extend', '').replace(/(\);|;)/g, '').split('(');
		var name = match[0].trim();

		return {
			'name' : name,
			'type' : 'EXTEND'
		};
	}

	_parseMixins(rule) {
		var match = MIXINS_MATCH.exec(rule);
		return {
			'type': 'MIXIN',
			'name': match[1],
			'parameters': this._parseVariables.call(this, match[2]),
			'value': match[3]
		}
	}

	_parseFunctions(rule) {
		let match = FUNCTIONS_MATCH.exec(rule);
		return {
			'type': 'FUNCTION',
			'name': match[1],
			'parameters': this._parseVariables.call(this, match[2]),
			'value': match[3]
		}
	}

	_parseVariables(rule) {
		const match = rule.match(VARIABLES_MATCH),
			variables = [];

		for (let i = 0, tot = match.length; i < tot; i++) {
			console.log('VARIABLE: ', rule);
			let parsedValue = match[i].split(':')[1];
			if(parsedValue) {
				parsedValue = this._type(parsedValue.trim().replace(/('|")/g, ''));
			}
			variables.push({
				'type': 'VARIABLE',
				'name': match[i].split(':')[0].replace('$', ''),
				'value': parsedValue
			});
		};
		return variables
	}

	_parseSelectors(rule) {
		var match = SELECTOR_MATCH.exec(this._removeLineBreakAndTabs(rule));
		var properties = this._extractProperties.call(this, match[2]);
		return {
			'type': 'SELECTOR',
			'name': match[1],
			'properties': properties
		}
	}

	_parse(rule) {
		let formattedRule,
			position = this._position(rule);
		rule = this._removePosition(rule);
		if(SELECTOR_MATCH.exec(this._removeLineBreakAndTabs(rule))) {
			formattedRule = this._parseSelectors(rule);
		} else if(FUNCTIONS_MATCH.exec(rule)) {
			formattedRule = this._parseFunctions(rule);
		} else if(MIXINS_MATCH.exec(rule)) {
			formattedRule = this._parseMixins(rule);
		}
		formattedRule.line = position.line;
		formattedRule.col = position.col;
		return formattedRule;
	}

	_recursive(rule, tree, siblings, level) {
		if(rule.indexOf('{') == -1) {
			tree.variables = this._parseVariables(rule);
			return;
		}
		let normalized = rule.substring(0, rule.indexOf('}') + 1);
		let selectors = normalized.match(SELECTOR_ONLY_MATCH);
		let selector = selectors[selectors.length - 1];
		let currentlevel = normalized.match(/{/g).length;
		normalized = selector + normalized.substring(normalized.lastIndexOf('{') + 1);
		let parsedSelector = this._parse(normalized);

		if(!level || level === currentlevel) {
			siblings = siblings || [];
			siblings.push(parsedSelector);
		} else {
			parsedSelector.children = siblings;
			siblings = [parsedSelector];
		}

		if(currentlevel === 1) {
			tree.scss.push(parsedSelector);
		}
		this._recursive(rule.replace(normalized, ''), tree, siblings, currentlevel);
	}

	_addPosition(index, line) {
		let regex = /[^\s]/.exec(line);
		return ` //position:(${index + 1},${regex? regex.index : 0})\n`
	}

	_position(line) {
		let positions = POSITION_REGEX.exec(line);
		return { line: positions[1], col: positions[2]};
	}

	_removePosition(rule) {
		return rule.replace(POSITION_REGEX, '');
	}

	parse() {
		let tree = {
			name: this.filename,
			scss: []
		}, lines = this.scss.split('\n');

		this.scss = lines.reduce((current, line, index) => {
			if(line.trim()) {
				if(index == 0) {
					current += this._addPosition(index, current);
				}
				line += this._addPosition(index, line);
			}
			return current + line;
		});
		var normalized = this.scss.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\s{2,}/g, ' ');
		normalized = normalized.replace(/(#{)([^}]+)(})/g, `${STRING_REPLACEMENT_START_SYMBOL}$2${STRING_REPLACEMENT_END_SYMBOL}`).replace(/\/\*[^\*]+\*\//g, '');
		this._recursive(normalized, tree);
		return tree;
	}
}

module.exports = SCSSParser;
