'use strict'

// This file contains code that we reuse
// between our tests.

const { build: buildApplication } = require('fastify-cli/helper')
const path = require('node:path')
const AppPath = path.join(__dirname, '..', 'app.js')

// Default environment variables for tests
process.env.NODE_ENV = process.env.NODE_ENV || 'dev'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret'
process.env.DB_HOST = process.env.DB_HOST || 'localhost'
process.env.DB_USER = process.env.DB_USER || 'sa'
process.env.DB_PASS = process.env.DB_PASS || 'password'
process.env.DB_NAME = process.env.DB_NAME || 'test'
process.env.SKIP_DB = 'true'

// Fill in this config with all the configurations
// needed for testing the application
function config () {
  return {
    skipOverride: true // Register our application with fastify-plugin
  }
}

// automatically build and tear down our instance
async function build (t) {
  // you can set all the options supported by the fastify CLI command
  const argv = [AppPath]

  // fastify-plugin ensures that all decorators
  // are exposed for testing purposes, this is
  // different from the production setup
  const app = await buildApplication(argv, config())

  // close the app after we are done
  t.after(() => app.close())

  return app
}

module.exports = {
  config,
  build
}
