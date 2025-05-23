import { RequestPayload } from './http';

export interface FILTER {
  (payload: RequestPayload): boolean | Rule;
}
export interface LOADEDFILTER {
  (
    ruleSource: Array<Rule>,
    type?: string,
    configFromApp?: Record<any, any>,
  ): FILTER;
}
export interface LOADEDFILTERSET {
  public: FILTER;
  private: FILTER;
}

export interface AuthObject {
  scheme: string;
  username?: string;
  password?: string;
  token?: string;
}
export interface ValidEntryObject {
  path?: string;
  value?: string;
  queryParam?: string;
  values?: Array<string>;
  regex?: string;
  header?: string;
}
export interface Rule {
  method: string;
  origin?: string;
  path?: string;
  url?: string;
  valid?: ValidEntryObject[];
  auth?: AuthObject;
  connectionType?: string;
}

export interface FiltersType {
  private: Rule[];
  public: Rule[];
}

export interface TestResult {
  url: any;
  auth: any;
}
