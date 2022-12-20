import axios from 'axios';
import axiosRetry from 'axios-retry';

const axiosInstance = axios.create({
  timeout: 5000,
});

axiosRetry(axiosInstance, {
  retries: 3,
  retryCondition: () => true, // retry no matter what
  retryDelay: axiosRetry.exponentialDelay,
});

export { axiosInstance };
