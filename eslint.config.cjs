const neostandard = require('neostandard')

module.exports = [
  // *.js are the CommonJS builds generated from *.mjs by esm2umd; coverage/ is the c8 report
  { ignores: ['**/*.js', 'coverage/**'] },
  ...neostandard()
]
