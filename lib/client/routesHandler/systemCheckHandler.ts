import { Request, Response } from 'express';
import {
  checkCredentials,
  loadCredentialsFromConfig,
} from '../utils/credentials';
import { log as logger } from '../../logs/logger';
import { ClientOpts } from '../types/client';

export const systemCheckHandler = async (req: Request, res: Response) => {
  // Systemcheck is the broker client's ability to assert the network
  // reachability and some correctness of credentials for the service
  // being proxied by the broker client.

  const clientOpts = res.locals.clientOpts as ClientOpts;
  const brokerClientValidationMethod =
    clientOpts.config.brokerClientValidationMethod || 'GET';
  const brokerClientValidationTimeoutMs =
    clientOpts.config.brokerClientValidationTimeoutMs || 5000;

  // set auth header according to config
  const { auths, rawCreds } = loadCredentialsFromConfig(clientOpts.config);

  // make the internal validation request
  const validationResults: any = [];
  let errorOccurred = true;
  if (auths.length > 0) {
    for (let i = 0; i < auths.length; i++) {
      logger.info(`Checking if credentials at index ${i} are valid`);
      const auth = auths[i];
      const rawCred = rawCreds[i];
      const { data, errorOccurred: err } = await checkCredentials(
        auth,
        clientOpts.config,
        brokerClientValidationMethod,
        brokerClientValidationTimeoutMs,
      );
      data['maskedCredentials'] =
        rawCred.length <= 6
          ? '***'
          : `${rawCred.substring(0, 3)}***${rawCred.substring(
              rawCred.length - 3,
            )}`;
      validationResults.push(data);
      errorOccurred = err;
      logger.info('Credentials checked');
    }
  } else {
    logger.info(
      'No credentials specified - checking if target can be accessed without credentials',
    );
    const { data, errorOccurred: err } = await checkCredentials(
      null,
      clientOpts.config,
      brokerClientValidationMethod,
      brokerClientValidationTimeoutMs,
    );
    data['maskedCredentials'] = null;
    validationResults.push(data);
    errorOccurred = err;
  }

  if (errorOccurred) {
    return res.status(500).json(validationResults);
  } else {
    return res.status(200).json(validationResults);
  }
};
