interface BackendAPI {
  API_BASE_URL: string;
}

interface BrokerClient {
  PREFLIGHT_CHECKS_ENABLED: string;
  INSECURE_DOWNSTREAM: string;
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

interface CommitSigning {
  GIT_COMMITTER_NAME: string;
  GIT_COMMITTER_EMAIL: string;
  GPG_PASSPHRASE: string;
  GPG_PRIVATE_KEY: string;
}

export type Config = BackendAPI &
  BrokerClient &
  BrokerServer &
  CommitSigning &
  HighAvailabilityMode &
  Record<string, any>;
