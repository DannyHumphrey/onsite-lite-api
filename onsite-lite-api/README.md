# Getting Started with [Fastify-CLI](https://www.npmjs.com/package/fastify-cli)
This project was bootstrapped with Fastify-CLI.

## Available Scripts

In the project directory, you can run:

### `npm run dev`

To start the app in dev mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm start`

For production mode

### `npm run test`

Run the test cases.

## Learn More

To learn Fastify, check out the [Fastify documentation](https://fastify.dev/docs/latest/).

## Environment Configuration

Database connection settings are loaded from environment specific `.env` files.
Create a file named `.env.<environment>` in the project root with the
following variables:

```
NODE_ENV=<environment>
JWT_SECRET=<secret>
DB_HOST=<database host>
DB_USER=<database user>
DB_PASS=<database password>
DB_NAME=<database name>
```

Where `<environment>` is one of `dev`, `qa`, `uat`, `staging` or `live`.
