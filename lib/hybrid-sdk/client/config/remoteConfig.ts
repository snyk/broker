import { readFileSync, writeFileSync } from 'fs';
import { makeRequestToDownstream } from '../../http/request';
import { ClientOpts } from '../../common/types/options';
import { BrokerConnectionApiResponse } from '../types/api';
import { capitalizeKeys } from '../utils/configurations';
import version from '../../common/utils/version';
import { getAuthConfig } from '../auth/oauth';
import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';
import { log as logger } from '../../../logs/logger';

export const retrieveConnectionsForDeployment = async (
  clientOpts: ClientOpts,
  universalFilePath: string,
) => {
  const deploymentId = clientOpts.config.deploymentId;
  const apiVersion = clientOpts.config.apiVersion;
  const request: PostFilterPreparedRequest = {
    url: `${clientOpts.config.API_BASE_URL}/hidden/brokers/deployments/${deploymentId}/connections?version=${apiVersion}`,
    headers: {
      'Content-Type': 'application/vnd.api+json',
      Authorization: `${getAuthConfig().accessToken?.authHeader}`,
      'x-broker-client-id': `${clientOpts.config.brokerClientId}`,
      'x-broker-client-version': `${version}`,
    },
    method: 'GET',
  };
  let connectionsResponse = await makeRequestToDownstream(request);
  if (connectionsResponse.statusCode != 200) {
    if (connectionsResponse.statusCode == 404) {
      throw new Error(
        `No deployment found. You must create a deployment first.`,
      );
    } else {
      const errorBody = JSON.parse(connectionsResponse.body);
      logger.error(
        {},
        `${connectionsResponse.statusCode}-${errorBody.error}:${errorBody.error_description}. Trying once again.`,
      );
      connectionsResponse = await makeRequestToDownstream(request);
      if (connectionsResponse.statusCode != 200) {
        if (connectionsResponse.statusCode == 404) {
          throw new Error(
            `No deployment found. You must create a deployment first.`,
          );
        } else {
          throw new Error(
            `${connectionsResponse.statusCode}-${errorBody.error}:${errorBody.error_description}`,
          );
        }
      }
    }
  }
  const connections = JSON.parse(connectionsResponse.body)
    .data as BrokerConnectionApiResponse[];
  const connectionsObjectForFile = { CONNECTIONS: {} };
  for (let i = 0; i < connections.length; i++) {
    connectionsObjectForFile.CONNECTIONS[`${connections[i].attributes.name}`] =
      {
        ...capitalizeKeys(
          connections[i].attributes.configuration.default ?? {},
        ),
        ...capitalizeKeys(
          connections[i].attributes.configuration.required ?? {},
        ),
      };
    connectionsObjectForFile.CONNECTIONS[
      `${connections[i].attributes.name}`
    ].type = connections[i].attributes.configuration.type;
    connectionsObjectForFile.CONNECTIONS[
      `${connections[i].attributes.name}`
    ].identifier = connections[i].attributes.identifier;
    connectionsObjectForFile.CONNECTIONS[
      `${connections[i].attributes.name}`
    ].id = connections[i].id;
    connectionsObjectForFile.CONNECTIONS[
      `${connections[i].attributes.name}`
    ].friendlyName = connections[i].attributes.name;

    const connectionRelationships = connections[i].relationships ?? [];
    const contextMap: Object = {};
    for (const context of connectionRelationships) {
      contextMap[context.id] = {
        ...ContextKeysToUpperCase(context.attributes.context),
      };
    }

    connectionsObjectForFile.CONNECTIONS[
      `${connections[i].attributes.name}`
    ].contexts = contextMap;
  }
  const universalConfigFileBuffer = readFileSync(universalFilePath);
  const universalConfigFile = JSON.parse(
    universalConfigFileBuffer.toString() ?? { CONNECTIONS: {} },
  );
  universalConfigFile['CONNECTIONS'] = connectionsObjectForFile.CONNECTIONS;
  writeFileSync(universalFilePath, JSON.stringify(universalConfigFile));
  return;
};

function ContextKeysToUpperCase(
  record: Record<string, string>,
): Record<string, string> {
  const capitalizedRecord: Record<string, string> = {};
  for (const key in record) {
    if (record.hasOwnProperty(key)) {
      const capitalizedKey = key.toUpperCase();
      capitalizedRecord[capitalizedKey] = record[key];
    }
  }
  return capitalizedRecord;
}
