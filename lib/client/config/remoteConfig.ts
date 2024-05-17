import { readFileSync, writeFileSync } from 'fs';
import { makeRequestToDownstream } from '../../common/http/request';
import { PostFilterPreparedRequest } from '../../common/relay/prepareRequest';
import { ClientOpts } from '../../common/types/options';
import { BrokerConnectionApiResponse } from '../types/api';

export const retrieveConnectionsForDeployment = async (
  clientOpts: ClientOpts,
  universalFilePath: string,
) => {
  try {
    const tenantId = clientOpts.config.tenantId;
    const installId = clientOpts.config.installId;
    const deploymentId = clientOpts.config.deploymentId;
    const apiVersion = clientOpts.config.apiVersion;
    const request: PostFilterPreparedRequest = {
      url: `${clientOpts.config.API_BASE_URL}/rest/tenants/${tenantId}/brokers/installs/${installId}/deployments/${deploymentId}/connections?version=${apiVersion}`,
      headers: {
        'Content-Type': 'application/vnd.api+json',
        Authorization: `${clientOpts.accessToken?.authHeader}`,
      },
      method: 'GET',
    };
    const connectionsResponse = await makeRequestToDownstream(request);
    if (connectionsResponse.statusCode != 200) {
      const errorBody = JSON.parse(connectionsResponse.body);
      throw new Error(
        `${connectionsResponse.statusCode}-${errorBody.error}:${errorBody.error_description}`,
      );
    }
    const connections = JSON.parse(connectionsResponse.body)
      .data as BrokerConnectionApiResponse[];
    const connectionsObjectForFile = { CONNECTIONS: {} };
    for (let i = 0; i < connections.length; i++) {
      connectionsObjectForFile.CONNECTIONS[
        `${connections[i].attributes.name}`
      ] = {
        ...connections[i].attributes.configuration.default,
        ...connections[i].attributes.configuration.required,
      };
      connectionsObjectForFile.CONNECTIONS[
        `${connections[i].attributes.name}`
      ].type = connections[i].attributes.type;
      connectionsObjectForFile.CONNECTIONS[
        `${connections[i].attributes.name}`
      ].identifier = connections[i].identifier;
      connectionsObjectForFile.CONNECTIONS[
        `${connections[i].attributes.name}`
      ].id = connections[i].id;
    }
    const universalConfigFileBuffer = readFileSync(universalFilePath);
    const universalConfigFile = JSON.parse(
      universalConfigFileBuffer.toString() ?? { CONNECTIONS: {} },
    );
    universalConfigFile['CONNECTIONS'] = connectionsObjectForFile.CONNECTIONS;
    writeFileSync(universalFilePath, JSON.stringify(universalConfigFile));
    return;
  } catch (err) {
    throw new Error(
      `${err} - Error retrieving and loading connections from Deployment ID`,
    );
  }
};
