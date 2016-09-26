'use strict';

var fs = require('fs');

const PROPERTIES_MATCH = /(^[\w][^;]+|^(@include|@extend)[^;]+);\s\/\/position:\(\d+,\d+\)/g,
	SELECTOR_MATCH = /([\.\#\w\-\:\=\[\]\'\",\s&]+)\s?{(\n|[^}]*)}/,
	SELECTOR_ONLY_MATCH = /(^[\.\#\w\-\:\=\[\]\'\",\s&]+|@function\s?([^(]+)\(.*\)|@mixin\s([^(]+)(\([^)]+\))?)+\s{/g,
	VARIABLES_MATCH = /\$([^$,]+);\s\/\/position:\(\d+,\d+\)/g,
	MIXINS_MATCH = /@mixin\s([^(]+)(\([^)]+\))?{([^}]+)}/,
	FUNCTIONS_MATCH = /@function\s?([^(]+)\((.*)\)\s?{([^}]+)}/,
	INCLUDE_MATCH = /@include\s?([^(]+)(.*)\s?{([^}]+)}/,
	ANIMATION_MATCH = /keyframes\s([^{]+){/,
	CSS_UNIT = /([\d\.]+)(px|em|rem|vw|vh|%|pt|cm|in|mm)?/,
	UNITS = /(\d|\.|px|em|rem|vw|vh|%|pt|cm|in|mm)/g,
	STRING_REPLACEMENT_START_SYMBOL = '!STR_START!',
	STRING_REPLACEMENT_END_SYMBOL = '!STR_END!',
	POSITION_REGEX = /\s\/\/position:\((\d+),(\d+)\)/,
	POSITION_REGEX_GLOBAL = /\s\/\/position:\((\d+),(\d+)\)/g;

const includePath = '../water-gardens/app/assets/sass/'

class ScssParser {
	constructor(filename) {
		this.filename = filename;
		this.scss = fs.readFileSync(filename, 'UTF-8');
		if(!this.scss) {
			throw new Error('File not found.');
		}
	}

	_filename(filename) {
		if(filename.indexOf('/') > 0) {
			return filename.replace(/(.*)\/([\w\-]+)$/, '$1/_$2.scss');
		} else {
			return `_${filename}.scss`;
		}
	}

	_filepath(filename) {
		let filepath = this._filename(filename),
			parentPath = this.filename.replace(/(.*)\/([^\/;\.]+(.scss)?)$/, '$1/');
		if(fs.existsSync(includePath + filepath)) {
			return includePath + filepath;
		} else if(fs.existsSync(parentPath + filepath.replace())) {
			return parentPath + filepath;
		} else if(fs.existsSync(includePath + filepath.replace('_', ''))) {
			return includePath + filepath.replace('_', '');
		} else {
			return parentPath + filepath.replace('_', '');
		}
	}

	_import() {
		const IMPORT_REGEX = /@import ['|"](.*)['"];/g;
		let imports = [],
			matches;
		while (matches = IMPORT_REGEX.exec(this.scss)) {
			let filepath = this._filepath(matches[1]);
			let importFile = new ScssParser(filepath);
			importFile.importName = matches[1].replace(/(.*)\/([^\/;\.]+)$/, '$1/_$2');
			imports.push(importFile.parse());
		}
		return imports;
	}

	_type(value) {
		if(!value) {
			return;
		}
		value = value.replace(new RegExp(STRING_REPLACEMENT_START_SYMBOL, 'g'), '#{').replace(new RegExp(STRING_REPLACEMENT_END_SYMBOL, 'g'), '}');
		const isHexa = value.indexOf('#') > 0,
			isRgb = value.indexOf('rgb') > 0;
		let formattedValue = [];

		if(value.indexOf(':') > -1) {
			var aux = value.split(':');
			formattedValue.push({
				name: aux[0],
				value: aux[1]
			});
		}

		if(value.indexOf('calc') > -1) {
			formattedValue.push({
				type: 'calc',
				value: value.replace(/calc\s?\(/, '').replace(')', '')
			});
		} else if(isHexa || isRgb) {
			formattedValue.push({
				type: 'COLOR',
				unit: isHexa? 'HEXADECIMAL' : 'RGB',
				value: value
			});
		} else if(value.indexOf('url') > 0) {
			formattedValue.push({
				type: 'URL',
				value: value.replace(/url\(['"]?([\w\.:\/_\-\+?%&]+)['"]?\)/g)
			});
		} else if (CSS_UNIT.test(value) && !value.replace(UNITS, '').trim()) {
			var matches = value.trim().split(' ');
			for(let i = 0; i < matches.length; i++) {
				let match = matches[i].match(CSS_UNIT);
				formattedValue.push({
					type: 'SIZE',
					value: match[1],
					unit: match[2]
				});
			}
		} else {
			formattedValue.push({
				type: 'string',
				value: value
			});
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
		const matches = rule.trim().match(PROPERTIES_MATCH);
		if(!matches) {
			if(rule.replace(POSITION_REGEX_GLOBAL, '').trim() == '') {
				return properties;
			} else {
				console.log('>>>>FIXME: ', rule);
				return [{
					'FIXME': rule
				}]
			}
		}
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
		console.log('MIXINS', rule);
		var match = MIXINS_MATCH.exec(rule);
		console.log('MIXINS Match', match);
		return {
			'type': 'MIXIN',
			'name': match[1],
			'parameters': match[2]? this._parseVariables.call(this, match[2]) : [],
			'value': match[3].replace(POSITION_REGEX_GLOBAL, '').replace(new RegExp(STRING_REPLACEMENT_START_SYMBOL, 'g'), '#{').replace(new RegExp(STRING_REPLACEMENT_END_SYMBOL, 'g'), '}')
		}
	}

	_parseFunctions(rule) {
		let match = FUNCTIONS_MATCH.exec(rule);
		return {
			'type': 'FUNCTION',
			'name': match[1],
			'parameters': this._parseVariables.call(this, match[2]),
			'value': match[3].replace(POSITION_REGEX_GLOBAL, '').replace(new RegExp(STRING_REPLACEMENT_START_SYMBOL, 'g'), '#{').replace(new RegExp(STRING_REPLACEMENT_END_SYMBOL, 'g'), '}')
		}
	}

	_parseAnimations(rule) {
		let match = ANIMATION_MATCH.exec(rule);
		console.log(match);
		return {
			'type': 'ANIMATION',
			'name': match[1],
			'value': {
				'type': 'LOGIC',
				'value': rule
			}
		}
	}

	_parseVariables(rule) {
		const match = rule.match(VARIABLES_MATCH),
			variables = [];
		if(!match) {
			return variables;
		}

		for (let i = 0, tot = match.length; i < tot; i++) {
			let variable = match[i];
			let position = this._position(variable);
			variable = this._removePosition(variable);
			let parsedValue = variable.split(':')[1];
			if(parsedValue) {
				parsedValue = this._type(parsedValue.trim().replace(/('|")/g, ''));
			}
			variables.push({
				'type': 'VARIABLE',
				'name': variable.split(':')[0].replace('$', ''),
				'value': parsedValue,
				'line': position.line,
				'col': position.col
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
		console.log('Rule', rule);
		console.log('Functions', FUNCTIONS_MATCH.exec(rule));
		if(ANIMATION_MATCH.exec(rule)) {
			formattedRule = this._parseAnimations(rule);
		} else if(FUNCTIONS_MATCH.exec(rule)) {
			formattedRule = this._parseFunctions(rule);
		} else if(MIXINS_MATCH.exec(rule)) {
			formattedRule = this._parseMixins(rule);
		} else if(SELECTOR_MATCH.exec(this._removeLineBreakAndTabs(rule))) {
			formattedRule = this._parseSelectors(rule);
		} else {
			formattedRule = {
				'type': 'LOGIC',
				'value': rule.replace(POSITION_REGEX, '')
			}
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
		console.log(selector);
		normalized = selector + normalized.substring(normalized.lastIndexOf('{') + 1);
		let parsedSelector = this._parse(normalized);
		if(parsedSelector.type == 'SELECTOR') {
			if(!level || level === currentlevel) {
				siblings = siblings || [];
				siblings.push(parsedSelector);
			} else {
				parsedSelector.children = siblings;
				siblings = [parsedSelector];
			}
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
			scss: [],
			imports: this._import()
		}, lines = this.scss.split('\n');

		this.scss = lines.reduce((current, line, index) => {
			if(line.trim()) {
				if(index == 1) {
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

module.exports = ScssParser;
