import { Client } from 'undici';

// TODO: cacert to be specified here?

let client:Client;

export const getRequestToDownstream = (origin) => {
  client = new Client(origin, {
    bodyTimeout: process.env.BROKER_DOWNSTREAM_TIMEOUT
      ? parseInt(process.env.BROKER_DOWNSTREAM_TIMEOUT)
      : 30000,
    keepAliveTimeout: 60 * 1000, // Keep-alive timeout in milliseconds
  });
  return client;
};

export const closeClient = () => {
  if(!client.closed){
    client.close();
  }
};
