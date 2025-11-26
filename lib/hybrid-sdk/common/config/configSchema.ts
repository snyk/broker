import { z } from 'zod';

// Schema for connection validation auth
const ConnectionHeaderAuthSchema = z.object({
  type: z.literal('header'),
  name: z.string().optional(),
  value: z.string(),
});

const ConnectionBasicAuthSchema = z.object({
  type: z.literal('basic'),
  username: z.string(),
  password: z.string(),
});

const ConnectionAuthSchema = z.union([
  ConnectionHeaderAuthSchema,
  ConnectionBasicAuthSchema,
]);

// Schema for connection validations
const ConnectionValidationSchema = z.object({
  url: z.string(),
  method: z.string().optional(),
  auth: ConnectionAuthSchema.optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string()).optional(),
});

// Schema for broker type configuration
const BrokerTypeConfigSchema = z.object({
  validations: z.array(ConnectionValidationSchema).optional(),
  default: z.record(z.unknown()).optional(),
  required: z.record(z.unknown()).optional(),
});

// Schema for BROKER_CLIENT_CONFIGURATION
const BrokerClientConfigurationSchema = z.object({
  common: z.object({
    default: z.record(z.unknown()).optional(),
    required: z.record(z.unknown()).optional(),
  }).optional(),
}).catchall(BrokerTypeConfigSchema); // Allow any broker type key

// Schema for CONNECTIONS_MANAGER
const ConnectionsManagerSchema = z.object({
  watcher: z.object({
    interval: z.number().int().positive().optional(),
  }).optional(),
}).passthrough();

// Main config schema - uses camelCase keys since validation happens after camelifying
export const BrokerConfigSchema = z.object({
  port: z.number().int().positive().optional(),
  brokerType: z.enum(['client', 'server']),
  
  // API and versioning
  apiVersion: z.string().optional(),
  dispatcherUrlPrefix: z.string().optional(),

  // Connections manager
  connectionsManager: ConnectionsManagerSchema.optional(),

  // ACCEPT flags
  acceptEssentials: z.boolean().optional(),
  acceptGit: z.boolean().optional(),
  acceptIac: z.string().optional(),
  acceptLargeManifests: z.boolean().optional(),
  acceptCustomPrTemplates: z.boolean().optional(),

  // Workload configuration
  remoteWorkloadName: z.string().optional(),
  remoteWorkloadModulePath: z.string().optional(),
  clientWorkloadName: z.string().optional(),
  clientWorkloadModulePath: z.string().optional(),

  // Broker configuration
  brokerServerUniversalConfigEnabled: z.boolean().optional(),
  supportedBrokerTypes: z.array(z.string()),
  craCompatibleTypes: z.array(z.string()).optional(),

  // Main broker client configuration
  brokerClientConfiguration: BrokerClientConfigurationSchema.optional(),

  // Filter rules paths
  filterRulesPaths: z.record(z.string()),

  // Allow additional properties for backward compatibility
  // This matches the Record<string, any> behavior in CONFIGURATION type
  // Also allows original UPPER_SNAKE_CASE keys since camelify preserves both
}).passthrough();

// Infer TypeScript type from schema
export type BrokerConfig = z.infer<typeof BrokerConfigSchema>;

// Validation function with better error messages
export function validateBrokerConfig(
  config: unknown,
): { success: true; data: BrokerConfig } | { success: false; error: string; details: z.ZodError } {
  const result = BrokerConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Format error message for better readability
  const errorMessage = result.error.errors
    .map((err) => {
      const path = err.path.join('.');
      return path ? `${path}: ${err.message}` : err.message;
    })
    .join('; ');

  return {
    success: false,
    error: `Config validation failed: ${errorMessage}`,
    details: result.error,
  };
}

