const { TestPulseReporter } = require('../../../dist');

module.exports = {
  test: {
    include: ['spec/**/*.spec.js'],
    reporters: ['default', new TestPulseReporter()],
  },
};
