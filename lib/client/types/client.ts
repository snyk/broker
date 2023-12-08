import { CheckResult } from '../checks/types';
import { FiltersType } from '../../common/types/filter';

export interface HookResults {
  preflightCheckResults?: CheckResult[];
}

export interface IdentifyingMetadata {
  capabilities: string[];
  clientId: string;
  filters: Map<string, FiltersType> | FiltersType;
  preflightChecks: CheckResult[] | undefined;
  version: string;
  serverId?: string;
  identifier?: string;
  supportedIntegrationType?: string;
  socketVersion?: number;
  socketType?: string;
  friendlyName?: string;
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
  friendlyName?: string;
  supportedIntegrationType: string;
  serverId: string;
  url: any;
  latency: any;
  socket: any;
  destroy: any;
  send: any;
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
