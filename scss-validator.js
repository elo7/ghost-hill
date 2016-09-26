class ScssValidator {
	constructor(tree) {
		this.tree = tree;
	}

	_properties(allprops, rule) {
		let all = allprops.concat(rule.properties);
		if(rule.children) {
			for(let i = 0; i< rule.children.length; i++) {
				let r = rule.children[i];
				all = all.concat(this._properties(all, r));
			}
		}
		return all;
	}

	_allProperties() {
		let all = [];
		for(let i = 0; i< this.tree.scss.length; i++) {
			let rule = this.tree.scss[i];
			all = all.concat(this._properties(all, rule));
		}
		return all;
	}

	_hasVariable(variable) {
		let values = this._allProperties().reduce((current, value) => {
				return value.value? current.concat(value.value) : current;
			}, [])
			.reduce((current, value) => {
				return current.concat(value.value);
			}, []);

		for(let i =0; i < values.length; i++) {
			for(let j = 0; j < vals.length; j++) {
				if(values[i] === '$' + variable.name) {
					return true;
				}
			}
		}
		return false;
	}

	checkUnusedVars() {
		this.tree.variables.forEach((variable) => {
			if(!this._hasVariable(variable)) {
				console.log(`Unused var: $${variable.name} at line ${variable.line} and column ${variable.col}`);
			}
		});
	}
}

module.exports = ScssValidator;
