export interface LogContext {
  url: string;
  requestMethod: string;
  requestHeaders: Record<string, any>;
  requestId: string;
  streamingID?: string;
  transport?: string;
  maskedToken: string;
  hashedToken: string;
  error?: string;
  resultUrlSchemeAdded?: boolean;
  httpUrl?: string;
  userAgentHeaderSet?: boolean;
  authHeaderSetByRuleAuth?: boolean;
  authHeaderSetByRuleUrl?: boolean;
  bodyVarsSubstitution?: string;
  headerVarsSubstitution?: string;
  ioUrl?: string;
  responseStatus?: string;
  responseHeaders?: string;
  responseBodyType?: string;
  ioErrorType?: string;
  ioOriginalBodySize?: string;
}
