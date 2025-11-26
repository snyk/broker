import { FiltersType, LOADEDFILTERSET } from './filter';

export interface CONFIG {
  supportedBrokerTypes: string[];
  brokerType: 'client' | 'server';
  filterRulesPaths: { [key: string]: string };

  apiHostname: string;
  ACCEPT_IAC?: string;
}

export type CONFIGURATION = CONFIG & Record<string, any>;

export interface ClientOpts {
  port: number;
  config: CONFIGURATION;
  filters?: FiltersType | Map<string, FiltersType>;
  serverId?: string;
  connections?: Record<string, any>;
  oauth?: {
    clientId: string;
    clientSecret: string;
  };
  accessToken?: {
    authHeader: string;
    expiresIn: number;
  };
  plugins?: Map<string, any>;
}

export interface ServerOpts {
  port: number;
  config: CONFIGURATION;
}
export interface LoadedFiltersSet {
  loadedFilters?: LOADEDFILTERSET | Map<string, LOADEDFILTERSET>;
}
export type LoadedClientOpts = LoadedFiltersSet & ClientOpts;

export interface LoadedServerOpts extends ServerOpts {
  loadedFilters: LOADEDFILTERSET | Map<string, LOADEDFILTERSET>;
}
