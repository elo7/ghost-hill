const SassParser = require('../scss-ast.js'),
	args = require('yargs').argv;

console.log(new SassParser(args.file).parse());
