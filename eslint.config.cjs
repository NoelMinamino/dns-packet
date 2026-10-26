const neostandard = require('neostandard')

module.exports = neostandard({
  // *.js are the CommonJS builds generated from *.mjs by esm2umd
  ignores: ['**/*.js', 'coverage/**']
})
