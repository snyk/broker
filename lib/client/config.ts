interface BackendAPI {
  API_BASE_URL: string;
}

interface BrokerClient {
  PREFLIGHT_CHECKS_ENABLED: string;
}

interface BrokerServer {
  BROKER_SERVER_URL: string;
}

/**
 * Configuration options for HA (high-availability) mode.
 */
interface HighAvailabilityMode {
  BROKER_DISPATCHER_BASE_URL: string;
  BROKER_HA_MODE_ENABLED: string;
}

export type Config = BackendAPI &
  BrokerClient &
  BrokerServer &
  HighAvailabilityMode;
