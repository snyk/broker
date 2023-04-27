import axios from 'axios';

/**
 * axiosClient is a pre-configured HTTP client for functional tests.
 * - timeout: 1000 ms
 * - validateStatus: true
 */
const axiosClient = axios.create({
  timeout: 1_000,
  validateStatus: () => true,
});

export { axiosClient };
