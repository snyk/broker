import { ConnectionValidation } from './config';

export interface BrokerConnectionApiResponse {
  id: string;
  type: string;
  attributes: BrokerConnectionAttributes;
  relationships?: {
    id: string;
    type: string;
    attributes: {
      context: Record<string, string>;
    };
  }[];
}
export interface BrokerConnectionAttributes {
  configuration: {
    default: {};
    required: {};
    validations: Array<ConnectionValidation>;
    type: string;
  };
  name: string;
  identifier: string | null;
  deployment_id: string;
  secrets?: {
    primary: {
      encrypted: string;
      expires_at: string;
      nonce: string;
    };
    secondary: {
      encrypted: string;
      expires_at: string;
      nonce: string;
    };
  };
}
