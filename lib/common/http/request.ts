import http from 'http';
import https from 'https';

export interface HttpResponse {
  headers: Object;
  statusCode: number | undefined;
  body: any;
}

// TODO: TLS config, Timeout and retries

export const makeRequestToDownstream = async (
  url: string,
  headers: Object,
  method: string,
  body?: string,
): Promise<HttpResponse> => {
  const httpClient = url.startsWith('https') ? https : http;
  const options: http.RequestOptions = {
    method: method,
    headers: headers as any,
  };

  return new Promise<HttpResponse>((resolve, reject) => {
    try {
      const req = httpClient.request(url, options, (response) => {
        let data = '';

        // A chunk of data has been received.
        response.on('data', (chunk) => {
          data += chunk;
        });

        // The whole response has been received.
        response.on('end', () => {
          resolve({
            headers: response.headers,
            statusCode: response.statusCode,
            body: data,
          });
        });

        // An error occurred while fetching.
        response.on('error', (error) => {
          reject(error);
        });
      });
      if (body) {
        req.write(body);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
};
