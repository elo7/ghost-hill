const ScssParser = require('../scss-ast.js'),
	ScssValidator = require('../scss-validator.js'),
	args = require('yargs').argv;

const tree = new ScssParser(args.file).parse();
console.log(JSON.stringify(tree))
new ScssValidator(tree).checkUnusedVars();
