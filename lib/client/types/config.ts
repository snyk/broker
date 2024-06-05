interface BackendAPI {
  API_BASE_URL: string;
}

interface BrokerClient {
  BROKER_CLIENT_URL?: string;
  HTTPS_CERT: string;
  HTTPS_KEY: string;
  INSECURE_DOWNSTREAM: string;
  PREFLIGHT_CHECKS_ENABLED: string;
}

interface BrokerServer {
  BROKER_SERVER_URL: string;
  BROKER_SERVER_MANDATORY_AUTH_ENABLED?: boolean;
}

/**
 * Configuration options for HA (high-availability) mode.
 */
interface HighAvailabilityMode {
  BROKER_HA_MODE_ENABLED: string;
}

interface CommitSigning {
  GIT_COMMITTER_NAME: string;
  GIT_COMMITTER_EMAIL: string;
  GPG_PASSPHRASE: string;
  GPG_PRIVATE_KEY: string;
}

interface SourceTypes {
  sourceTypes: {
    [key: string]: {
      publicId?: string;
      name: string;
      type: string;
      brokerType: string;
    };
  };
}

export type Config = BackendAPI &
  BrokerClient &
  BrokerServer &
  CommitSigning &
  HighAvailabilityMode &
  SourceTypes &
  Record<string, any>;

export interface ConnectionValidations {
  validations: ConnectionValidation[];
}

export interface ConnectionValidation {
  url: string;
  method?: string;
  auth: ConnectionHeaderAuth | ConnectionBasicAuth;
  body?: any;
  headers?: Record<string, string>;
}

export interface ConnectionHeaderAuth {
  type: 'header';
  value: string;
}

export interface ConnectionBasicAuth {
  type: 'basic';
  username: string;
  password: string;
}

export type ConnectionConfig = Record<string, any> & ConnectionValidations;
