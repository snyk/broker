import { getServerId, highAvailabilityModeEnabled } from '../../dispatcher';
import { log as logger } from '../../../logs/logger';
import { executePreflightChecks, preflightChecksEnabled } from '../../checks';
import { commitSigningEnabled, commitSigningFilterRules } from '../../scm';
import { ClientOpts, HookResults } from '../../types/client';
import { CheckResult } from '../../checks/types';

export const processStartUpHooks = async (
  clientOpts: ClientOpts,
  brokerClientId: string,
): Promise<HookResults> => {
  try {
    let okToBoot = true;
    if (!clientOpts.config.brokerToken) {
      const brokerToken = clientOpts.config.brokerToken;
      // null, undefined, empty, etc.
      logger.error(
        { brokerToken },
        '[MISSING_BROKER_TOKEN] BROKER_TOKEN is required to successfully identify itself to the server',
      );
      okToBoot = false;
      const error = new ReferenceError(
        'BROKER_TOKEN is required to successfully identify itself to the server',
      );
      error['code'] = 'MISSING_BROKER_TOKEN';
      throw error;
    }

    if (!clientOpts.config.brokerServerUrl) {
      const brokerServerUrl = clientOpts.config.brokerServerUrl;
      // null, undefined, empty, etc.
      logger.error(
        { brokerServerUrl },
        '[MISSING_BROKER_SERVER_URL] BROKER_SERVER_URL is required to connect to the broker server',
      );
      okToBoot = false;
      const error = new ReferenceError(
        'BROKER_SERVER_URL is required to connect to the broker server',
      );
      error['code'] = 'MISSING_BROKER_SERVER_URL';
      throw error;
    }

    // Return early before processing anything further since the basics are not there....
    if (!okToBoot) {
      return { okToBoot };
    }

    if (!clientOpts.config.BROKER_CLIENT_URL) {
      const proto =
        !clientOpts.config.key && !clientOpts.config.cert ? 'http' : 'https';
      clientOpts.config.BROKER_CLIENT_URL = `${proto}://localhost:${clientOpts.port}`;
    }

    let serverId;
    if (highAvailabilityModeEnabled(clientOpts.config)) {
      serverId = await getServerId(clientOpts.config, brokerClientId);
      if (serverId === null) {
        logger.warn({}, 'could not receive server id from Broker Dispatcher');
        serverId = '';
      } else {
        logger.info({ serverId }, 'received server id');
        clientOpts.config.serverId = serverId;
      }
    }

    let preflightCheckResults: CheckResult[] = [];
    if (preflightChecksEnabled(clientOpts.config)) {
      // wrap preflight checks execution into try-catch, so the broker client
      // will start anyway
      try {
        preflightCheckResults = await executePreflightChecks(clientOpts.config);
      } catch (error) {
        logger.error({ error }, 'failed to execute preflight checks');
      }
    }

    if (commitSigningEnabled(clientOpts.config)) {
      const commitSigningRules = commitSigningFilterRules();
      clientOpts.filters.private?.push(...commitSigningRules);
      logger.info(
        { enabled: true, rulesCount: commitSigningRules.length },
        'loading commit signing rules',
      );
    }

    return {
      okToBoot,
      preflightCheckResults: preflightCheckResults.length
        ? preflightCheckResults
        : undefined,
    };
  } catch (error) {
    logger.error({ error }, 'Error processing startup hooks');
    return { okToBoot: false };
  }
};
