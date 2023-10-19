export interface LogContext {
  url: string;
  requestMethod: string;
  requestId: string;
  streamingID?: string;
  transport?: string;
  maskedToken: string;
  hashedToken: string;
  error?: string;
  httpUrl?: string;
  responseStatus?: string;
}
export interface ExtendedLogContext extends LogContext {
  requestHeaders?: Record<string, any>;
  resultUrlSchemeAdded?: boolean;
  userAgentHeaderSet?: boolean;
  authHeaderSetByRuleAuth?: boolean;
  authHeaderSetByRuleUrl?: boolean;
  bodyVarsSubstitution?: string;
  headerVarsSubstitution?: string;
  ioUrl?: string;
  responseHeaders?: string;
  responseBodyType?: string;
  ioErrorType?: string;
  ioOriginalBodySize?: string;
}
