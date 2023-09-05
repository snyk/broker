import axios from 'axios';
import { log as logger } from './log';
import axiosRetry from 'axios-retry';

const axiosInstance = axios.create({
  timeout: 2500,
});

axiosRetry(axiosInstance, {
  retries: 3,
  retryCondition: () => true, // retry no matter what
  shouldResetTimeout: true,
  retryDelay: axiosRetry.exponentialDelay,
  onRetry: (retryCount, error, requestConfig) => {
    if (retryCount > 2) {
      logger.warn(
        {
          retryCount,
          errorMessage: error.message,
          url: requestConfig.url,
          requestId:
            requestConfig.headers && requestConfig.headers['Snyk-Request-Id'],
        },
        `retrying request x ${retryCount} `,
      );
    }
  },
});

export { axiosInstance };
