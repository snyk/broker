import { FiltersType } from '../../common/types/filter';
import { CheckResult } from '../checks/types';
import { Primus } from 'primus';

export interface HookResults {
  preflightCheckResults?: CheckResult[];
}

export interface ConfigMetadata {
  brokerClientId: string;
  version: string;
  haMode: boolean;
  debugMode: boolean;
  bodyLogMode: boolean;
  credPooling: boolean;
  privateCa: boolean;
  tlsReject: boolean;
  proxy: boolean;
  customAccept: boolean;
  insecureDownstream: boolean;
  universalBroker: boolean;
}

/**
 * Identity and capability metadata the broker client sends when identifying
 * itself to the broker server over a WebSocket. Describes who the client is,
 * what it supports, and which connection it is for (e.g. friendlyName,
 * identifier). Cloned and augmented per connection when creating socket pairs.
 */
export interface IdentifyingMetadata {
  capabilities: string[];
  clientId: string;
  filters: Map<string, FiltersType> | FiltersType;
  preflightChecks: CheckResult[] | undefined;
  version: string;
  serverId?: string;
  identifier?: string;
  id: string;
  isDisabled: boolean;
  supportedIntegrationType?: string;
  socketVersion?: number;
  socketType?: string;
  friendlyName?: string;
  clientConfig: ConfigMetadata;
  role: Role;
}

/** Per-context parameter key-value pairs (e.g. env vars for a GitHub App installation). */
export type ConnectionContext = Record<string, string>;

export enum Role {
  primary = 'primary',
  secondary = 'secondary',
}
export interface ConnectionMetadata {
  identifier?: string;
  supportedIntegrationType?: string;
  token?: string;
  serverId?: string;
}

export interface WebSocketConnection
  extends Pick<Primus, 'destroy' | 'emit' | 'end' | 'on'> {
  capabilities?: string[];
  clientConfig?: any;
  friendlyName?: string;
  identifier?: string;
  role: Role;
  serverId: string;
  socketType: 'client';
  socketVersion?: number;
  supportedIntegrationType: string;
  timeoutHandlerId?: NodeJS.Timeout;
  connectionStartTime?: number;

  // Added by primus, but specific to the client
  socket: any;
  readyState: number;
  transport: {
    extraHeaders?: Record<string, string>;
  };
  url: URL;

  // Added by primus-emitter plugin
  send: (event: string, ...args: any[]) => void;
}
export interface ValidationResult {
  connectionName: string;
  validated: boolean;
  results: Record<any, any>;
}
