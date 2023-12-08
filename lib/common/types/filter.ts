import { RequestPayload } from './http';

export interface FILTER {
  (payload: RequestPayload): false | TestResult;
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
  requiredCapabilities?: Array<string>;
  stream?: boolean;
  auth?: AuthObject;
}

export interface FiltersType {
  private: Rule[];
  public: Rule[];
}

export interface TestResult {
  url: any;
  auth: any;
  stream: boolean | undefined;
}
