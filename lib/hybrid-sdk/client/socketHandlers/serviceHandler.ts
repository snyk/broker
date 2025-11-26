import { log as logger } from '../../../logs/logger';
import { getClientOpts } from '../config/configHelpers';
import { syncClientConfig } from '../connectionsManager/synchronizer';
import {
  getGlobalIdentifyingMetadata,
  getWebsocketConnections,
} from '../connectionsManager/manager';

export const serviceHandler = async (
  msg: { url: string; headers: { 'snyk-request-id': string } },
  cb: (params: {
    status: number;
    headers: { requestId: string };
    body: string;
  }) => void,
) => {
  const clientOptions = getClientOpts();
  // strip off any query strings
  const command = msg.url.indexOf('?') < 0 ? msg.url : msg.url.split('?')[0];
  const requestId = msg.headers['snyk-request-id'];
  logger.debug({ command, requestId }, 'Service message received.');
  if (!clientOptions) {
    cb({
      status: 501,
      headers: { requestId },
      body: JSON.stringify({
        msg: 'Service channel is not available in classic Broker.',
      }),
    });
  } else {
    switch (command) {
      case '/filters/reload':
        logger.debug({}, 'Reloading filters.');
        cb({
          status: 200,
          headers: { requestId },
          body: JSON.stringify({ ok: true, msg: `Filters reloaded.` }),
        });
        break;
      case '/config/reload':
        logger.debug({}, 'Reloading config.');
        if (clientOptions.config?.universalBrokerEnabled) {
          cb({
            status: 200,
            headers: { requestId },
            body: JSON.stringify({ ok: true, msg: `Synchronizing Config.` }),
          });
          await syncClientConfig(
            clientOptions,
            getWebsocketConnections(),
            getGlobalIdentifyingMetadata(),
          );
        } else {
          logger.debug({}, 'Service command not available in classic broker.');
          cb({
            status: 501,
            headers: { requestId },
            body: JSON.stringify({
              ok: false,
              msg: 'Service command not available in classic broker.',
            }),
          });
        }
        break;
      default:
        logger.error(
          { command, requestId },
          'Unknown service message received.',
        );
        cb({
          status: 400,
          headers: { requestId },
          body: JSON.stringify({ ok: false, msg: 'Unknown service command.' }),
        });
    }
  }
};
