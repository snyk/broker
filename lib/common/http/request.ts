import request from 'request';
import { config } from '../config';

let requestToDownstream = request;
requestToDownstream = request.defaults({
  ca: config.caCert,
  timeout: process.env.BROKER_DOWNSTREAM_TIMEOUT
    ? parseInt(process.env.BROKER_DOWNSTREAM_TIMEOUT)
    : 60000,
  agentOptions: {
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxTotalSockets: 1000,
  },
});

export const getRequestToDownstream = () => {
  return requestToDownstream;
};
