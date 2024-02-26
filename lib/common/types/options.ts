import { FiltersType, LOADEDFILTERSET } from './filter';

export interface ClientOpts {
  port: number;
  config: Record<string, any>;
  filters: FiltersType | Map<string, FiltersType>;
  serverId?: string;
  connections?: Record<string, any>;
}

export interface ServerOpts {
  port: number;
  config: Record<string, any>;
  filters: FiltersType;
}
export interface LoadedClientOpts extends ClientOpts {
  loadedFilters: LOADEDFILTERSET | Map<string, LOADEDFILTERSET>;
}
export interface LoadedServerOpts extends ServerOpts {
  loadedFilters: LOADEDFILTERSET | Map<string, LOADEDFILTERSET>;
}
