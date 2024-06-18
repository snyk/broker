import { FiltersType } from '../../common/types/filter';
import { CheckResult } from '../checks/types';

export interface HookResults {
  preflightCheckResults?: CheckResult[];
}

export interface ConfigMetadata {
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

export interface WebSocketConnection {
  options: {
    reconnect: any;
    ping: number;
    pong: number;
    timeout: number;
    transport: any;
    queueSize: any;
    stategy: any;
  };
  transport: any;
  socketVersion?: any;
  socketType?: string;
  identifier?: string;
  clientConfig?: any;
  role: Role;
  friendlyName?: string;
  supportedIntegrationType: string;
  serverId: string;
  url: any;
  latency: any;
  socket: any;
  destroy: any;
  send: any;
  end: any;
  open: any;
  emit: any;
  capabilities?: any;
  on: (string, any) => any;
  readyState: any;
}
// export interface WebSocketConnection {
//   websocket: Connection;
// }

export interface ValidationResult {
  connectionName: string;
  validated: boolean;
  results: Record<any, any>;
}
