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




## License

* [License: Apache License, Version 2.0](LICENSE)
* [Contributing](.github/CONTRIBUTING.md)

# TODO / Aims

- [x] Proxy e2e socket (server -> client -> internal -> client -> server)
- [ ] Can serve as both client and server
- [ ] client can forward requests from internal to server
