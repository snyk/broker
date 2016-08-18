[![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)](https://snyk.io)

***

# @snyk/broker

The broker client for proxying requests between your private machines and the external broker system.

The broker forwards requests to the client (this package) and responds. An example use is for communicating with an internal GitHub enterprise server, but this is not intended as the exclusive use.

## Usage

<!-- Explain how to install, how to run the tool if it's on the cli, or how  -->
<!-- to use the project in the author code. If this is a node module, please -->
<!-- also document the usage API.                                            -->

To run the broker in daemon mode, use the existing tools on your system like `systemd`. If you're unsure, we can recommend this post on [running as a service](https://certsimple.com/blog/deploy-node-on-linux#node-linux-service-systemd) on your machine.

## Development & how to test

The project's source code is written in full ES6 (with commonjs modules). This requires the source to be developed with node@6. However, during the release process, the code is transpiled to ES5 via babel and is released with node LTS in mind, node@4 and upwards.

<!-- ideally the project will run all tests with `npm install; npm test`,    -->
<!-- but if requires additional information to test, please include          -->
<!-- directions here, bearing in mind a clean starting machine.              -->

## Notes and caveats

<!-- Anything that this project doesn't do? Any special knowledge required?  -->

### Terminology

* Broker: The application that will accept (or reject), transform and forward requests. This entire repository is the broker.
* Server: server instance of the broker, this accepts HTTPS request and forwards them to the connected broker identified by an ID.
* Client: the user's client instance of the broker that will accept and reject requests from the server and relay them back and forth to their own internal service.
* Internal: the system that is private to the user that the broker will manage a specific subset of requests for.
* Accept: a request that has been accepted based on user defined rules to be forwarded to their own internal systems.
* Reject: all those requests that are not accepted (these will result in a `400` and a `Blocked` message).
* Configuration: the user's private environment configuration that controls the accept list and important tokens that allow the broker to access their internal system.


## Configuration

The broker configuration is primarily driven through environment values which can also be stored inside of a local `.env` file. The `.env` file format is a simple key/value pair, i.e.:

```text
TOKEN=12345678
# this is a comment
HOST=foo-bar.com
```

Note that the configuration is case insensitive and will automatically be normalised to camelCase (as well as keeping your origin casing).



### Client required configuration

- `BROKER_ID`: this is your unique token to identify and register the client against the broker server.
- `BROKER_SERVER`: typically this will point to `https://broker.snyk.io` but if you want to run your own broker, this value should point to your broker server address.

### HTTPS

As the broker needs to run a local server to handle inbound forwarding requests, by default the broker will run using insecure HTTP (and will warn out to the console saying so).

We recommend you run your broker over HTTPS (for clients you could use a self signed certificate, for servers we highly recommend fully signed). To do this, you need to point the broker to your `.key` and `.cert` file from the environment values, or the `.env` file:

```text
HTTPS_KEY=<path-to.key>
HTTPS_CERT=<path-to.cert>
```

When the broker runs, it will use these files to start the local server over HTTPS.

## The accept filter

A JSON file pointed to in the `ACCEPT` environment value controls what can be accepted by the broker. Any requests that do not match the acceptance list will be rejected with a `400` status code.

Below is the Snyk default accept filter, that allows inbound requests to a GitHub enterprise instance for two files only on all your repos, `package.json` and `.snyk`. The following is the contents of the `accept.json` file:

```json
[
  {
    "method": "GET",
    "path": "/:name/:repo/:branch/package.json",
    "origin": "https://${TOKEN}@${HOST}",
  },
  {
    "method": "GET",
    "path": "/:name/:repo/:branch/.snyk",
    "origin": "https://${TOKEN}@${HOST}",
  }
]
```

Focusing on the first element in the array, there are two important tokens in the `path` property and the `origin` property.

The first, `:param` is an expression that is matched against the URL being requested. This means that the broker server can request any value in the `:name`, `:repo` and `:branch` position.

The second, `${PARAM}` is populated with the matching value in your configuration. This way you can keep your tokens or environment details private.

The final result is that the broker will accept and forward `GET` requests to my local server that will respond to `https://12345678@foo-bar.com/snyk/broker/master/package.json`.

# TODO / Aims

- [x] Proxy e2e socket (server -> client -> internal -> client -> server)
- [x] Can serve as both client and server
- [ ] Client can forward requests from internal to server

# Notes

- Broker clients are *uniquely* identified (i.e. the same ID can't be used twice)

# Future ideas

- [ ] Add validation middleware support to broker server (to validate client ids)

## License

* [License: Apache License, Version 2.0](LICENSE)
* [Contributing](.github/CONTRIBUTING.md)
