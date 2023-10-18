import { loadBrokerConfig } from '../../lib/common/config';
import {
  makeRequestToDownstream,
  makeSingleRawRequestToDownstream,
  makeStreamingRequestToDownstream,
} from '../../lib/common/http/request';
import http from 'http';

const nock = require('nock');

const serverUrl = 'http://dummy-downstream-service';
const httpsServerUrl = 'http://dummy-downstream-service';
const error = { message: 'Error occurred', code: 'ECONNRESET' };
describe('Test HTTP request helpers', () => {
  beforeAll(async () => {
    nock(`${serverUrl}`)
      .persist()
      .get(`/test`)
      .reply(() => {
        const response = 'OK';
        return [200, response];
      });

    nock(`${serverUrl}`).persist().get(`/fail`).replyWithError(error);
  });
  beforeEach(() => {
    nock(`${serverUrl}`)
      .get(`/failtwice`)
      .twice()
      .replyWithError(error)
      .get(`/failtwice`)
      .reply(() => {
        const response = 'OK';
        return [200, response];
      });
  });

  it('Makes a request successfully', async () => {
    const response = await makeRequestToDownstream({
      url: `${serverUrl}/test`,
      headers: {},
      method: 'GET',
    });
    expect(response).toEqual({ body: 'OK', headers: {}, statusCode: 200 });
  });

  it('Retries a request twice successfully', async () => {
    const response = await makeRequestToDownstream({
      url: `${serverUrl}/failtwice`,
      headers: {},
      method: 'GET',
    });
    expect(response).toEqual({ body: 'OK', headers: {}, statusCode: 200 });
  });

  it('Retries a request till failure', async () => {
    try {
      await makeRequestToDownstream({
        url: `${serverUrl}/fail`,
        headers: {},
        method: 'GET',
      });
      expect(true).toBeFalsy();
    } catch (err) {
      expect(err).toEqual(error);
    }
  });

  it('Makes a streaming request successfully', async () => {
    const response = await makeStreamingRequestToDownstream({
      url: `${serverUrl}/test`,
      headers: {},
      method: 'GET',
    });
    expect(response).toBeInstanceOf(http.IncomingMessage);
  });

  it('Retries a streaming request twice successfully', async () => {
    const response = await makeStreamingRequestToDownstream({
      url: `${serverUrl}/failtwice`,
      headers: {},
      method: 'GET',
    });
    expect(response).toBeInstanceOf(http.IncomingMessage);
  });

  it('Retries a streaming request till failure', async () => {
    try {
      await makeStreamingRequestToDownstream({
        url: `${serverUrl}/fail`,
        headers: {},
        method: 'GET',
      });
      expect(true).toBeFalsy();
    } catch (err) {
      expect(err).toEqual(error);
    }
  });

  it('Does not retry on a raw request returns error successfully', async () => {
    try {
      await makeSingleRawRequestToDownstream({
        url: `${serverUrl}/failtwice`,
        headers: {},
        method: 'GET',
      });
      expect(true).toBeFalsy();
    } catch (err) {
      expect(err).toEqual(error);
    }
  });

  it('INSECURE DOWNSTREAM overrides https to http', async () => {
    process.env.INSECURE_DOWNSTREAM = 'true';
    loadBrokerConfig();
    const response = await makeRequestToDownstream({
      url: `${httpsServerUrl}/test`,
      headers: {},
      method: 'GET',
    });
    expect(response).toEqual({ body: 'OK', headers: {}, statusCode: 200 });
    delete process.env.INSECURE_DOWNSTREAM;
  });
  it('INSECURE DOWNSTREAM overrides https to http streaming requests', async () => {
    process.env.INSECURE_DOWNSTREAM = 'true';
    loadBrokerConfig();
    const response = await makeStreamingRequestToDownstream({
      url: `${httpsServerUrl}/test`,
      headers: {},
      method: 'GET',
    });
    expect(response).toBeInstanceOf(http.IncomingMessage);
    delete process.env.INSECURE_DOWNSTREAM;
  });
  it('INSECURE DOWNSTREAM overrides https to http single raw request', async () => {
    process.env.INSECURE_DOWNSTREAM = 'true';
    loadBrokerConfig();
    const response = await makeSingleRawRequestToDownstream({
      url: `${httpsServerUrl}/test`,
      headers: {},
      method: 'GET',
    });
    expect(response).toEqual({
      body: 'OK',
      headers: {},
      statusCode: 200,
      statusText: '',
    });
    delete process.env.INSECURE_DOWNSTREAM;
  });
});
