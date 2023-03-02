import axios from 'axios';
const logger = require('./log');
import axiosRetry from 'axios-retry';

const axiosInstance = axios.create({
  timeout: 5000,
});

axiosRetry(axiosInstance, {
  retries: 3,
  retryCondition: () => true, // retry no matter what
  retryDelay: axiosRetry.exponentialDelay,
  onRetry: (retryCount, error, requestConfig) => {
    if (error) {
      logger.warn(
        {
          retryCount,
          errorMessage: error.message,
          url: requestConfig.url,
          requestId:
            requestConfig.headers && requestConfig.headers['Snyk-Request-Id'],
        },
        'retrying request',
      );
    }
  },
});

export { axiosInstance };
