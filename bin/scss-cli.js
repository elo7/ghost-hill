const SassParser = require('../scss-ast.js'),
	args = require('yargs').argv;

console.log(JSON.stringify(new SassParser(args.file).parse()));
