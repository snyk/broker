declare module 'primus' {
  import * as http from 'http';
  import { Socket } from 'net';
  import { EventEmitter } from 'eventemitter3';

  namespace e {
    interface PrimusRequest extends http.IncomingMessage {
      uri: {
        pathname: string;
        [key: string]: any;
      };
    }

    interface Primus extends EventEmitter {
      socket: Socket;
      library(): void;
      open(): void;
      write(data: any): void;
      end(): void;
      destroy(fn?: (err?: any) => void): void;
      destroy(
        options?: { reconnect?: boolean; close?: boolean },
        fn?: (err?: any) => void,
      ): void;
      emits(event: string, parser: (next: any, parser: any) => void): void; // might be better tied to a TSD for https://github.com/primus/emits
      id(cb: (id: any) => void): void;
      createSocket(options?: IPrimusOptions): Socket;
      authorize(
        fn: (req: PrimusRequest, done: (error?: any) => void) => void,
      ): void;
      forEach(cb: (spark: ISpark, id: string, connections: any) => void): void;
      before(event: string, cb: () => void): void;
      before(
        event: string,
        cb: (req: http.ClientRequest, res: http.ServerResponse) => void,
      ): void;
      before(
        event: string,
        cb: (
          req: http.ClientRequest,
          res: http.ServerResponse,
          next: any,
        ) => void,
      ): void;
      remove(name: string): void;
      enable(name: string): void;
      disable(name: string): void;
      use(name: string, plugin: Object): void;
      transform(event: string, cb: (packet: any) => void): void;
      transforms(event: string, parser: (packet: any, next: any) => void): void; // might be better tied to a TSD for https://github.com/primus/emits

      // not present in the original primus.d.ts
      plugin(): any; // Returns all plugins (ark)
      plugin(name: string): any; // Returns specific plugin
      plugin(name: string, energon: string | object | Function): Primus; // Registers a plugin
      plugin(energon: {
        name?: string;
        server?: Function;
        client?: Function;
        library?: string;
      }): Primus; // Registers a plugin from object
    }

    interface IPrimusOptions {
      authorization?: Function;
      pathname?: string;
      parser?: string;
      transformer?: string;
      plugin?: Object;
      timeout?: number;
      global?: string;
      compression?: boolean;
      origins?: string;
      methods?: string;
      credentials?: boolean;
      maxAge?: string;
      headers?: boolean;
      exposed?: boolean;
      strategy?: any;
    }

    interface IPrimusConnectOptions {
      timeout?: number;
      ping?: number;
      pong?: number;
      strategy?: string;
      manual?: boolean;
      websockets?: boolean;
      network?: boolean;
      transport?: any;
      queueSize?: number;
      reconnect?: {
        max?: any;
        min?: number;
        retries?: number;
        factor?: number;
      };
    }

    /**
     * Represents an individual real-time WebSocket connection (Spark) in Primus.
     *
     * A Spark is created when a client establishes a connection to the Primus server.
     * It provides a low-level interface modeled after Node.js streams for bidirectional
     * communication between the server and a single client connection.
     *
     * The Spark interface is transformer-agnostic, meaning it works across different
     * real-time transport mechanisms (WebSockets, Engine.IO, SockJS, etc.) that Primus
     * supports.
     *
     * @example
     *t
     * primus.on('connection', (spark: ISpark) => {
     *   console.log('New connection:', spark.id);
     *   spark.write({ message: 'Hello client!' });
     * });
     **/
    interface ISpark {
      headers: any[];
      address: string;
      query: string;
      id: string;
      request: http.IncomingMessage & {
        uri: {
          pathname: string;
          [key: string]: any;
        };
      };

      write(data: any): void;
      end(data?: any, options?: Object): void;
      emits(event: string, parser: (next: any, parser: any) => void): void; // might be better tied to a TSD for https://github.com/primus/emits

      /**
       * Registers an event listener for this connection.
       *
       * When using the primus-emitter plugin, events can pass multiple arguments
       * to the callback function. The callback signature should match the number
       * of arguments sent via `spark.send(event, ...args)`.
       *
       * @param event - The event name to listen for
       * @param cb - Callback function that can accept any number of arguments
       *
       * @example
       *ript
       * // Single argument
       * spark.on('identify', (clientData) => { ... });
       *
       * // Multiple arguments (with primus-emitter)
       * spark.on('chunk', (streamingID, chunk, finished, ioResponse) => { ... });
       *        */
      on(event: string, cb: (...args: any[]) => void): void;

      /**
       * Sends an event with data to the client.
       *
       * This method is added by the `primus-emitter` plugin, which enables
       * event-based messaging on top of the raw WebSocket connection.
       *
       * @param event - The event name to send
       * @param args - Variable number of arguments to send with the event
       *
       * @example
       *
       * spark.send('identify', { capabilities: ['receive-post-streams'] });
       * spark.send('notification', { level: 'error', message: 'Something went wrong' });
       *        */
      send(event: string, ...args: any[]): void;
    }

    interface IPrimusStatic {
      new (): Primus;
      new (server: http.Server, options?: IPrimusOptions): Primus;
      connect(url: string, options?: IPrimusConnectOptions): Primus;

      // not present in the original primus.d.ts
      createSocket(
        options?: IPrimusOptions,
      ): new (url: string, options?: IPrimusConnectOptions) => Primus;
      Spark: {
        OPEN: number;
        OPENING: number;
        CLOSED: number;
      };
    }
  }

  const e: e.IPrimusStatic;

  export = e;
}
