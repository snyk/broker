export enum WorkloadType {
  remoteServer = 'remoteServer',
  localClient = 'localClient',
}

export interface RemoteServerWorkloadParams {
  connectionIdentifier: string;
  options: any;
  websocketConnectionHandler: any;
}

export interface LocalClientWorkloadParams {
  req: any;
  res: any;
  options: any;
}

export interface RemoteServerWorkloadRuntimeParams {
  payload: any;
  websocketHandler: any;
}
export interface LocalClientWorkloadRuntimeParams {
  makeRequestOverHttp?: boolean;
}

type WorkloadRuntimeParamType<
  T extends WorkloadType.localClient | WorkloadType.remoteServer,
> = T extends WorkloadType.remoteServer
  ? RemoteServerWorkloadRuntimeParams
  : T extends WorkloadType.localClient
  ? LocalClientWorkloadRuntimeParams
  : never;
export type WorkloadRuntimeReturnType = Promise<void> | Promise<any>;

interface WorkloadModule {
  default: new (
    connectionIdentifier: string,
    options: any,
    websocketConnectionHandler: any,
  ) => Workload<WorkloadType.remoteServer>;
}

export abstract class Workload<
  T extends WorkloadType.localClient | WorkloadType.remoteServer,
> {
  type: WorkloadType;
  name: string;

  constructor(name: string, type: WorkloadType) {
    this.name = name;
    this.type = type;
  }
  abstract handler(
    data: WorkloadRuntimeParamType<T>,
  ): WorkloadRuntimeReturnType;

  private static async instantiateRemoteServerWorkload(
    name: string,
    path: string,
    params: RemoteServerWorkloadParams,
  ): Promise<Workload<WorkloadType.remoteServer>> {
    const { connectionIdentifier, options, websocketConnectionHandler } =
      params;
    const importedModule = (await import(path)) as WorkloadModule;
    const WorkloadClass = importedModule[name];
    return new WorkloadClass(
      connectionIdentifier,
      options,
      websocketConnectionHandler,
    );
  }
  private static async instantiateLocalClientWorkload(
    name: string,
    path: string,
    params: LocalClientWorkloadParams,
  ): Promise<Workload<WorkloadType.localClient>> {
    const { req, res, options } = params;
    const importedModule = (await import(path)) as WorkloadModule;
    const WorkloadClass = importedModule[name];
    return new WorkloadClass(req, res, options);
  }

  static async instantiate(
    name: string,
    path: string,
    type: WorkloadType.localClient | WorkloadType.remoteServer,
    params,
  ): Promise<
    Workload<WorkloadType.localClient> | Workload<WorkloadType.remoteServer>
  > {
    if (!path) {
      throw new Error(
        `Unable to instantiate workload, path is undefined. Please check config.default.json to contain workload directives. Refer to https://github.com/snyk/broker/blob/master/config.default.json.`,
      );
    }
    switch (type) {
      case WorkloadType.remoteServer:
        return await this.instantiateRemoteServerWorkload(name, path, params);
      case WorkloadType.localClient:
        return await this.instantiateLocalClientWorkload(name, path, params);
      default:
        throw new Error(`Error loading workload - unknown type ${type}`);
    }
  }
}
