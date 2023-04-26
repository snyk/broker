# Testing

All tests in this repository are stored in `/test` folder. There are unit and
functional tests. All test suits can be executed by following command.

```bash
$ npm run test
```

## Unit tests

Run without starting the broker client or server, access network connections.
Can be relied upon to always run locally.

```bash
$ npm run test:unit
```

## Functional tests

Tests that run with broker client and server locally.

```bash
$ npm run test:functional
```

# Writing tests

All new tests should be written in TypeScript. This will help ensure we catch
smaller issues in tests that could cause flakey or incorrect tests.

## Best practices

- when writing functional tests ensure you use setup methods for [broker client](setup/broker-client.ts)
  or [broker server](setup/broker-server.ts)
- if you need an additional endpoint in test web server to mimic SCM functionality,
  add it to [test-web-server.ts](setup/test-web-server.ts)
