import { Request, Response } from 'express';
import {
  checkCredentials,
  checkBitbucketPatCredentials,
  loadCredentialsFromConfig,
} from '../utils/credentials';
import { log as logger } from '../../../logs/logger';
import { LoadedClientOpts } from '../../common/types/options';
import { expandConfigObjectRecursively } from '../../common/config/config';
import { validateConnection } from '../utils/connectionValidation';
import { ValidationResult } from '../types/client';
import { getConfigForConnections } from '../../common/config/universal';

export const systemCheckHandler = async (req: Request, res: Response) => {
  // Systemcheck is the broker client's ability to assert the network
  // reachability and some correctness of credentials for the service
  // being proxied by the broker client.
  const clientOpts = res.locals.clientOpts as LoadedClientOpts;
  if (clientOpts.config.universalBrokerEnabled) {
    const configForAllConnections = getConfigForConnections();
    const validationResults: ValidationResult[] = [];
    let isValidationPassing = true;
    for (const [connectionName, config] of configForAllConnections.entries()) {
      config.validations = expandConfigObjectRecursively(
        config.validations,
        config,
      );
      logger.info({ connectionName }, '[System Check] Validating connection.');
      const { passing, data } = await validateConnection(config);
      const result = {
        connectionName: connectionName,
        validated: passing,
        results: data,
        message: undefined as string | undefined,
      };
      if (!passing) {
        result[
          'message'
        ] = `Validation failed, please review connection details for ${connectionName}.`;
        isValidationPassing = false;
      }
      validationResults.push(result);
    }
    res.status(isValidationPassing ? 200 : 500).json(validationResults);
  } else {
    const brokerClientValidationMethod =
      clientOpts.config.brokerClientValidationMethod || 'GET';
    const brokerClientValidationTimeoutMs =
      clientOpts.config.brokerClientValidationTimeoutMs || 5000;

    // set auth header according to config
    const { auths, rawCreds } = loadCredentialsFromConfig(clientOpts.config);

    // make the internal validation request
    const validationResults: {
      brokerClientValidationUrl: string;
      brokerClientValidationMethod: string;
      brokerClientValidationTimeoutMs: number;
      maskedCredentials?: string | null;
    }[] = [];
    let errorOccurred = true;
    if (auths.length > 0) {
      for (let i = 0; i < auths.length; i++) {
        logger.info(`Checking if credentials at index ${i} are valid.`);
        const auth = auths[i];
        const rawCred = rawCreds[i];
        let credsResult: {
          data: {
            brokerClientValidationUrl: string;
            brokerClientValidationMethod: string;
            brokerClientValidationTimeoutMs: number;
            ok?: boolean;
            brokerClientValidationUrlStatusCode?: number;
            error?: string | Error;
            maskedCredentials?: string | null;
          };
          errorOccurred: boolean;
        };
        // Bitbucket server always returns a 200 regardless of the validity of the PAT
        // this function is to look inside the response body and determine if the
        // credentials really are valid or not.
        if (clientOpts.config.BITBUCKET_PAT) {
          logger.info('Using Bitbucket PAT credentials check.');
          credsResult = await checkBitbucketPatCredentials(
            auth,
            clientOpts.config,
            brokerClientValidationMethod,
            brokerClientValidationTimeoutMs,
          );
        } else {
          logger.info('Using standard credentials check.');
          credsResult = await checkCredentials(
            auth,
            clientOpts.config,
            brokerClientValidationMethod,
            brokerClientValidationTimeoutMs,
          );
        }
        const { data, errorOccurred: err } = credsResult;
        data['maskedCredentials'] =
          rawCred.length <= 6
            ? '***'
            : `${rawCred.substring(0, 3)}***${rawCred.substring(
                rawCred.length - 3,
              )}`;
        validationResults.push(data);
        errorOccurred = err;
        logger.info('Credentials checked.');
      }
    } else {
      logger.info(
        'No credentials specified - checking if target can be accessed without credentials.',
      );
      let credsResult: {
        data: {
          brokerClientValidationUrl: string;
          brokerClientValidationMethod: string;
          brokerClientValidationTimeoutMs: number;
          maskedCredentials?: string | null;
        };
        errorOccurred: boolean;
      };
      if (clientOpts.config.BITBUCKET_PAT) {
        logger.info(
          'Using Bitbucket PAT credentials check (no explicit auth).',
        );
        credsResult = await checkBitbucketPatCredentials(
          null, // Pass null for auth as no specific auth from array
          clientOpts.config,
          brokerClientValidationMethod,
          brokerClientValidationTimeoutMs,
        );
      } else {
        logger.info('Using standard credentials check (no explicit auth).');
        credsResult = await checkCredentials(
          null, // Pass null for auth
          clientOpts.config,
          brokerClientValidationMethod,
          brokerClientValidationTimeoutMs,
        );
      }
      const { data, errorOccurred: err } = credsResult;
      data['maskedCredentials'] = null;
      validationResults.push(data);
      errorOccurred = err;
    }

    if (errorOccurred) {
      return res.status(500).json(validationResults);
    } else {
      return res.status(200).json(validationResults);
    }
  }
};
