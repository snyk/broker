import { FiltersType, LOADEDFILTERSET } from './filter';

export interface ClientOpts {
  port: number;
  config: Record<string, any>;
  filters: FiltersType | Map<string, FiltersType>;
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
  config: Record<string, any>;
  filters: FiltersType;
}
export interface LoadedFiltersSet {
  loadedFilters?: LOADEDFILTERSET | Map<string, LOADEDFILTERSET>;
}
export type LoadedClientOpts = LoadedFiltersSet & ClientOpts;

export interface LoadedServerOpts extends ServerOpts {
  loadedFilters: LOADEDFILTERSET | Map<string, LOADEDFILTERSET>;
}
