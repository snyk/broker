require('../patch-https-request-for-proxying');

import * as Primus from 'primus';
import * as relay from '../relay';
import { logger } from '../log';

class BrokerError extends ReferenceError {
  public code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function createSocket({
  url,
  token,
  filters,
  config,
  identifyingMetadata,
}) {
  if (!token) {
    // null, undefined, empty, etc.
    logger.error({ token }, 'missing client token');
    throw new BrokerError(
      'BROKER_TOKEN is required to successfully identify itself to the server',
      'MISSING_BROKER_TOKEN',
    );
  }

  if (!url) {
    // null, undefined, empty, etc.
    logger.error({ url }, 'missing broker url');
    throw new BrokerError(
      'BROKER_SERVER_URL is required to connect to the broker server',
      'MISSING_BROKER_SERVER_URL',
    );
  }

  const Socket = Primus.createSocket({
    transformer: 'engine.io',
    parser: 'EJSON',
    plugin: {
      emitter: require('primus-emitter'),
    },
    pathname: `/primus/${token}`,
  });

  // Will exponentially back-off from 0.5 seconds to a maximum of 20 minutes
  // Retry for a total period of around 4.5 hours
  const io = new Socket(url, {
    reconnect: {
      factor: 1.5,
      retries: 30,
      max: 20 * 60 * 1000,
    },
  });

  io.on('reconnect scheduled', (opts) => {
    const attemptIn = Math.floor(opts.scheduled / 1000);
    logger.warn(
      `Reconnect retry #${opts.attempt} of ${opts.retries} in about ${attemptIn}s`,
    );
  });

  io.on('reconnect failed', () => {
    io.end();
    logger.error('Reconnect failed');
    process.exit(1);
  });

  logger.info({ url }, 'broker client is connecting to broker server');

  const response = relay.response(filters, config, io);
  const streamingResponse = relay.streamingResponse;

  // RS note: this bind doesn't feel right, it feels like a sloppy way of
  // getting the filters into the request function.
  io.on('chunk', streamingResponse(token));
  io.on('request', response());
  io.on('error', ({ type, description }) => {
    if (type === 'TransportError') {
      logger.error({ type, description }, 'Failed to connect to broker server');
    } else {
      logger.warn({ type, description }, 'Error on websocket connection');
    }
  });
  io.on('open', () => {
    logger.info(
      { url, token, identifyingMetadata },
      'successfully established a websocket connection to the broker server',
    );
    const clientData = { token, metadata: identifyingMetadata };
    io.send('identify', clientData);
  });

  io.on('close', () => {
    logger.warn(
      { url, token },
      'websocket connection to the broker server was closed',
    );
  });

  // only required if we're manually opening the connection
  // io.open();

  return io;
}
