import { makeSingleRawRequestToDownstream } from '../../../hybrid-sdk/http/request';
import { PostFilterPreparedRequest } from '../../../common/relay/prepareRequest';
import version from '../../../common/utils/version';
import { CheckOptions, CheckResult } from '../types';

export const validateBrokerClientVersionAgainstServer = async (
  checkOptions: CheckOptions,
  config,
) => {
  const clientVersion = `${version}`;
  if (clientVersion != 'local') {
    const req: PostFilterPreparedRequest = {
      url: `${config.BROKER_SERVER_URL}/healthcheck`,
      headers: {},
      method: 'GET',
    };
    const brokerServerHealthcheckResponse =
      await makeSingleRawRequestToDownstream(req);

    const brokerServerVersion = JSON.parse(
      brokerServerHealthcheckResponse.body,
    ).version;

    const clientMinorVersion = parseInt(clientVersion.split('.')[1]);
    const brokerServerMinorVersion = parseInt(
      brokerServerVersion.split('.')[1],
    );
    if (
      clientMinorVersion <= brokerServerMinorVersion &&
      brokerServerMinorVersion - clientMinorVersion > 10
    ) {
      return {
        id: checkOptions.id,
        name: checkOptions.name,
        status: 'error',
        output:
          'Your broker client version is outdated. Please upgrade to latest version.',
      } satisfies CheckResult;
    } else {
      return {
        id: checkOptions.id,
        name: checkOptions.name,
        status: 'passing',
        output: 'Running supported broker client version.',
      } satisfies CheckResult;
    }
  } else {
    return {
      id: checkOptions.id,
      name: checkOptions.name,
      status: 'warning',
      output: 'Caution! You are running a dev version.',
    } satisfies CheckResult;
  }
};
