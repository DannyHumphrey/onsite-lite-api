'use strict'

const path = require('node:path')
const Fastify = require('fastify')
const AutoLoad = require('@fastify/autoload')

async function buildApp() {
  const app = Fastify({ logger: true })

  // Register plugins
  app.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    options: {}
  })

  // Register routes
  app.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: {}
  })

  return app
}

async function start() {
  try {
    const app = await buildApp()
    await app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
    console.log(`Fastify running on http://localhost:${app.server.address().port}`)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

start()
