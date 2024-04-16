import Primus from 'primus';
import Emitter from 'primus-emitter';
import { LoadedServerOpts } from '../common/types/options';
import { SocketHandler } from './types/socket';
import { handleIoError } from './socketHandlers/errorHandler';
import { handleSocketConnection } from './socketHandlers/connectionHandler';
import { initConnectionHandler } from './socketHandlers/initHandlers';
import { maskToken } from '../common/utils/token';
import { log as logger } from '../logs/logger';

const socketConnections = new Map();

export const getSocketConnections = () => {
  return socketConnections;
};

const socket = ({ server, loadedServerOpts }): SocketHandler => {
  const ioConfig = {
    transformer: 'engine.io',
    parser: 'EJSON',
    maxLength:
      parseInt(loadedServerOpts.config.socketMaxResponseLength) || 22020096, // support up to 21MB in response bodies
    transport: {
      allowEIO3: true,
      pingInterval:
        parseInt(loadedServerOpts.config.socketPingInterval) || 25000,
      pingTimeout: parseInt(loadedServerOpts.config.socketPingTimeout) || 20000,
    },
    compression: Boolean(loadedServerOpts.config.socketUseCompression) || false,
  };

  const websocket = new Primus(server, ioConfig);
  websocket.authorize(async (req, done) => {
    const maskedToken = maskToken(
      req.uri.pathname.replaceAll(/^\/primus\/([^/]+)\//g, '$1').toLowerCase(),
    );
    const authHeader = req.headers['authorization'];

    if (
      (!authHeader || !authHeader.startsWith('Bearer')) &&
      loadedServerOpts.config.BROKER_SERVER_MANDATORY_AUTH_ENABLED
    ) {
      logger.error({ maskedToken }, 'request missing Authorization header');
      done({
        statusCode: 401,
        authenticate: 'Bearer',
        message: 'missing required authorization header',
      });
      return;
    }

    const jwt = authHeader
      ? authHeader.substring(authHeader.indexOf(' ') + 1)
      : '';
    if (!jwt) logger.debug({}, `TODO: Validate jwt`);
    done();
    // let oauthResponse = await axiosInstance.request({
    //   url: 'http://localhost:8080/oauth2/introspect',
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/x-www-form-urlencoded',
    //   },
    //   auth: {
    //     username: 'broker-connection-a',
    //     password: 'secret',
    //   },
    //   data: `token=${token}`,
    // });

    // if (!oauthResponse.data.active) {
    //   logger.error({maskedToken}, 'JWT is not active (could be expired, malformed, not issued by us, etc)');
    //   done({
    //     statusCode: 403,
    //     message: 'token not active',
    //   });
    // } else {
    //   req.oauth_data = oauthResponse.data;
    //   done();
    // }
  });
  websocket.socketType = 'server';
  websocket.socketVersion = 1;
  websocket.plugin('emitter', Emitter);

  initConnectionHandler(loadedServerOpts, websocket);

  websocket.on('error', handleIoError);

  websocket.on('connection', handleSocketConnection);

  return { websocket };
};

export const bindSocketToWebserver = (
  server,
  loadedServerOpts: LoadedServerOpts,
): SocketHandler => {
  // bind the socket server to the web server
  return socket({
    server,
    loadedServerOpts,
  });
};
