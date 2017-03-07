[![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)](https://snyk.io)

[![Known Vulnerabilities](https://snyk.io/test/npm/snyk-broker/badge.svg?style=flat-square)](https://snyk.io/test/npm/snyk-broker)

***

# @snyk/broker

The broker client for proxying requests between your private machines and the external broker system.

The broker forwards requests to the client (this package) and responds. An example use is for communicating with an internal GitHub enterprise server, but this is not intended as the exclusive use.

## Usage

<!-- Explain how to install, how to run the tool if it's on the cli, or how  -->
<!-- to use the project in the author code. If this is a node module, please -->
<!-- also document the usage API.                                            -->

To run the broker in daemon mode, use the existing tools on your system like `systemd`. If you're unsure, we can recommend this post on [running as a service](https://certsimple.com/blog/deploy-node-on-linux#node-linux-service-systemd) on your machine.

### Installation

The broker as a CLI utility via npm:

```bash
$ npm install -g snyk-broker
```

You can also use it as a dependency in a `package.json`. Details on this later.

### Running the client

Running the client will require a unique `BROKER_TOKEN` and a `BROKER_SERVER_URL` pointing to a broker server. Once you have these, add them to your environment and run the broker in client mode.

However, you may want to use default settings for the `ACCEPT` rules and your environment. This can be first generated using the `init <name>` command:

```bash
$ broker init snyk --verbose
```

This will generate two new files: `accept.json` and `.env`. If the files already exist in the current working directory, the `init` command will fail and not overwrite your local copies.

Once you have these files, add your `BROKER_TOKEN` and other details to the `.env` file, then run the broker in client mode from the same directory as the `accept.json` and `.env`:

```bash
$ broker --verbose
  broker:client accept.json +0ms
  broker:client loading rules from accept.json +2ms
  broker:client running +1ms
  broker:client connecting to https://broker.snyk.io +26ms
  broker:client loading 17 new rules +1ms
  broker:client new filter: get /user/repos +0ms
  broker:client new filter: get /rate_limit +1ms
  broker:client new filter: get / +0ms
  broker:client new filter: post /repos/:user/:repo/hooks +0ms
  broker:client new filter: post /repos/:user/:repo/statuses/:sha +0ms
  broker:client new filter: get /:user/:repo +1ms
  broker:client new filter: get /:name/:repo/:branch/package.json +0ms
  broker:client new filter: get /:name/:repo/:branch/.snyk +0ms
  broker:client new filter: get /repos/:name/:repo +0ms
  broker:client new filter: get /repos/:name/:repo/git/refs +0ms
  broker:client new filter: get /repos/:name/:repo/git/refs/:ref +0ms
  broker:client new filter: get /repos/:name/:repo/pulls +0ms
  broker:client new filter: post /repos/:name/:repo/git/commits +0ms
  broker:client new filter: post /repos/:name/:repo/git/refs +0ms
  broker:client new filter: post /repos/:name/:repo/git/trees +0ms
  broker:client new filter: post /repos/:name/:repo/pulls +0ms
  broker:client new filter: patch /repos/:name/:repo/git/refs/:sha +1ms
  broker local server listening @ 7341 +101ms
  broker:client loading 1 new rules +2ms
  broker:client new filter: post /webhook/github +1ms
  broker:client identifying as XXXX-XXXX-XXXX-XXXX-XXXX on https://broker.snyk.io +93ms
```

It will identify itself against the server and will be now ready to broker inbound and outbound requests that validate fully against the accept rules.

### Running the server

As the server will typically be deployed, it's recommended to use the broker inside of a `package.json`, as per:

```json
{
  "name": "broker server",
  "private": true,
  "scripts": {
    "start": "ACCEPT=accept.json broker server --verbose"
  },
  "engines": {
    "node": "6"
  },
  "dependencies": {
    "snyk-broker": "^2.1.1"
  }
}
```

You will also need to include the right environment values (though by default, the server only requires `ACCEPT`), and the `accept.json` file.

The `private` rules should be determined by what you want to allow through the server, but the `public` rules will generally need to be the following:

```json
  "public": [{
    "//": "send any type of request to our connected clients",
    "method": "any",
    "path": "/*"
  }]
```

This `public` rule will ensure everything is forwarded to your clients, and will allow your client to handle blocking out messages.

## Development & how to test

The project's source code is written in full ES6 (with commonjs modules). This requires the source to be developed with node@6. However, during the release process, the code is transpiled to ES5 via babel and is released with node LTS in mind, node@4 and upwards.

To test, first clone the project, and in the project directory:

```bash
$ npm install
$ npm test
```

### Terminology

* Broker: The application that will accept (or reject), transform and forward requests. This entire repository is the broker.
* Server: server instance of the broker, this accepts HTTPS request and forwards them to the connected broker identified by an ID.
* Client: the user's client instance of the broker that will accept and reject requests from the server and relay them back and forth to their own internal service.
* Internal: the system that is private to the user that the broker will manage a specific subset of requests for.
* Accept: a request that has been accepted based on user defined rules to be forwarded to their own internal systems.
* Reject: all those requests that are not accepted (these will result in a `401` and a `Blocked` message).
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

- `BROKER_TOKEN`: this is your unique token to identify and register the client against the broker server.
- `BROKER_SERVER_URL`: typically this will point to `https://broker.snyk.io` but if you want to run your own broker, this value should point to your broker server address.

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
{
  "private": [
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
  ],
  "public": [
    {
      "method": "any",
      "path": "/*"
    }
  ]
}
```

Focusing on the first element in the array, there are two important tokens in the `path` property and the `origin` property.

The first, `:param` is an expression that is matched against the URL being requested. This means that the broker server can request any value in the `:name`, `:repo` and `:branch` position.

The second, `${PARAM}` is populated with the matching value in your configuration. This way you can keep your tokens or environment details private.

The final result is that the broker will accept and forward `GET` requests to my local server that will respond to `https://12345678@foo-bar.com/snyk/broker/master/package.json`.

### Private rules

Private filters are for requests that come from the broker server into your client and ask for resources inside your private infrastructure (such as a github enterprise instance).

### Public rules

Public filters are for requests that a recieved on your broker client and are intended to be forwarded to the broker server (such as a github webhook).

## Notes

- The broker requires at least node@4.latest
- Broker clients are *uniquely* identified (i.e. the same ID can't be used twice)
- If your private service is using an unrecognized certificate, you will need to supply a Certificate Authority file and add the following environment value when runnning the client: `CA_CERT=ca.cert.pem` - Client will load your CA certificate and use it for requests to your internal service

## License

* [License: Apache License, Version 2.0](LICENSE)
* [Contributing](.github/CONTRIBUTING.md)
* [Security](SECURITY.md)

