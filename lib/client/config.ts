interface BackendAPI {
  API_BASE_URL: string;
}

interface BrokerClient {
  PREFLIGHT_CHECKS_ENABLED: string;
}

interface BrokerServer {
  BROKER_SERVER_URL: string;
}

export type Config = BackendAPI & BrokerClient & BrokerServer;
