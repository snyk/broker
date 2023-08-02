const path = require('path');
const yaml = require('js-yaml');
const fs = require('fs');
const config = require('./config');
const logger = require('./log');

const SUPPORTED_IAC_EXTENSIONS = ['tf', 'yaml', 'yml', 'tpl', 'json'];
const IAC_SCM_ORIGINS = [
  'GITLAB',
  'AZURE_REPOS_HOST',
  'GITHUB_API',
  'BITBUCKET_API',
];
const CODE_SCM_ORIGINS = ['GITLAB', 'AZURE_REPOS_HOST', 'GITHUB', 'BITBUCKET'];
const SNIPPETS_CODE_SCM_ORIGINS = [
  'GITLAB',
  'AZURE_REPOS_HOST',
  'GITHUB_API',
  'BITBUCKET_API',
];

function nestedCopy(array) {
  return JSON.parse(JSON.stringify(array));
}

function injectRulesAtRuntime(filters) {
  const ACCEPT_IAC = process.env.ACCEPT_IAC || config.ACCEPT_IAC;
  if (ACCEPT_IAC) {
    logger.info(
      { accept: ACCEPT_IAC },
      'Injecting Accept rules for IAC extensions - Possible values tf, yaml, yml, json, tpl',
    );

    const extensions = ACCEPT_IAC.replace(/\s/g, '')
      .split(',')
      .filter((extension) => SUPPORTED_IAC_EXTENSIONS.includes(extension));
    if (extensions.length <= 0) {
      logger.error(
        { accept: extensions },
        '[MISCONFIGURATION] None of the requested ACCEPT IAC file extensions is compatible',
      );
    } else if (!filters.private[0].origin.includes('AZURE')) {
      // API endpoints for IAC (github, ghe, bitbucket server), doesn't matter for azure, gitlab
      // file pattern is different for Azure repos, requirements work for all others
      let template = nestedCopy(
        filters.private.filter(
          (entry) =>
            entry.method === 'GET' &&
            entry.path.includes('requirements') &&
            IAC_SCM_ORIGINS.filter((origin) =>
              entry.origin.includes(`{${origin}}`),
            ).length > 0,
        ),
      );
      for (let i = 0; i < template.length; i++) {
        template[i].path = template[i].path
          .replace('/requirements', '')
          .replace('%2Frequirements', '');
        template[i]['//'] = template[i]['//'].replace(
          'determine the full dependency tree',
          'scan IAC files',
        );
      }
      for (let i = 0; i < extensions.length; i++) {
        const extensionTemplate = nestedCopy(template);
        extensionTemplate[0].path = extensionTemplate[0].path.replace(
          'txt',
          extensions[i],
        );
        extensionTemplate[1].path = extensionTemplate[1].path.replace(
          'txt',
          extensions[i],
        );
        filters.private.push(...extensionTemplate);
      }
    } else if (filters.private[0].origin.includes('AZURE')) {
      // Copying and modifying in place in array, not doing NestedCopy here
      let templateToModify = filters.private.filter(
        (entry) =>
          entry.method === 'GET' &&
          entry.valid &&
          entry.valid[0].values.includes('**/requirements/*.txt'),
      );
      for (let i = 0; i < templateToModify.length; i++) {
        for (let j = 0; j < extensions.length; j++) {
          templateToModify[i].valid[0].values.push(`**/*.${extensions[j]}`);
          templateToModify[i].valid[0].values.push(`**%2F*.${extensions[j]}`);
        }
      }
    } else {
      logger.error(
        { accept: ACCEPT_IAC },
        'Error Unexpected error at rules injection time. Remove ACCEPT_IAC env var to skip injection logic.',
      );
    }
  }

  const ACCEPT_LARGE_MANIFESTS =
    process.env.ACCEPT_LARGE_MANIFESTS ||
    config.ACCEPT_LARGE_MANIFESTS == 'true';
  if (ACCEPT_LARGE_MANIFESTS) {
    const scmType = CODE_SCM_ORIGINS.find((element) => {
      if (filters.private[0].origin.includes(element)) {
        return true;
      }
    });
    if (scmType === 'GITHUB') {
      logger.info(
        { accept: ACCEPT_LARGE_MANIFESTS },
        'Injecting Accept rules for Manifest files',
      );
      const largeManifestRule = {
        '//': 'used to get given manifest file',
        method: 'GET',
        path: '/repos/:owner/:repo/git/blobs/:sha',
        origin: 'https://${GITHUB_TOKEN}@${GITHUB_API}',
      };
      filters.private.push(...[largeManifestRule]);
    }
  }
  const ACCEPT_CODE =
    process.env.ACCEPT_CODE ||
    process.env.ACCEPT_GIT ||
    config.ACCEPT_CODE ||
    config.ACCEPT_GIT;
  if (ACCEPT_CODE) {
    logger.info({ accept: ACCEPT_CODE }, 'Injecting Accept rules for Code/Git');

    let templateGET = nestedCopy(
      filters.private.filter(
        (entry) =>
          entry.method === 'GET' &&
          CODE_SCM_ORIGINS.filter((origin) =>
            entry.origin.includes(`{${origin}}`),
          ).length > 0,
      )[0] || [],
    );
    if (!Array.isArray(templateGET)) {
      // skipping all non SCM types
      const scmType = CODE_SCM_ORIGINS.find((element) => {
        if (templateGET.origin.includes(element)) {
          return true;
        }
      });

      templateGET['//'] = 'allow info refs (for git clone)';
      templateGET.origin = templateGET.origin
        .replace('https://${GITHUB_TOKEN}', 'https://pat:${GITHUB_TOKEN}')
        .replace(
          'https://${GITLAB}',
          'https://oauth2:${GITLAB_TOKEN}@${GITLAB}',
        );
      let templatePOST = nestedCopy(templateGET);

      templatePOST.method = 'POST';

      templatePOST['//'] = 'allow git-upload-pack (for git clone)';

      // Code snippets rules
      let templateGETForSnippets = nestedCopy(
        filters.private.filter(
          (entry) =>
            entry.method === 'GET' &&
            SNIPPETS_CODE_SCM_ORIGINS.filter((origin) =>
              entry.origin.includes(`{${origin}}`),
            ).length > 0,
        )[0],
      );
      templateGETForSnippets['//'] = 'needed to load code snippets';

      switch (scmType) {
        case 'AZURE_REPOS_HOST':
          templateGET.path = '*/info/refs*';
          templateGETForSnippets.path =
            '/:owner/_apis/git/repositories/:repo/items';
          templatePOST.path = '*/git-upload-pack';
          break;
        case 'GITHUB':
          templateGET.path = '*/info/refs*';
          templateGETForSnippets.path = '/repos/:name/:repo/contents/:path';
          templatePOST.path = '*/git-upload-pack';
          break;
        case 'GITLAB':
          templateGET.path = '*/info/refs*';
          templateGETForSnippets.path =
            '/api/v4/projects/:project/repository/files/:path';
          templatePOST.path = '*/git-upload-pack';
          break;
        case 'BITBUCKET':
          templateGET.path = '*/info/refs*';
          templateGETForSnippets.path =
            '/projects/:project/repos/:repo/browse*/:file';
          templatePOST.path = '*/git-upload-pack';
          break;
        default:
          logger.error(
            {},
            'Error writing Code specific rules - Cannot determine SCM type',
          );
      }

      filters.private.push(
        ...[templateGET, templatePOST, templateGETForSnippets],
      );
    }
  }
  return filters;
}

module.exports = (acceptFilename = '', folderLocation = '') => {
  let filters = {};
  if (acceptFilename) {
    const acceptLocation = path.resolve(
      folderLocation ? folderLocation : process.cwd(),
      acceptFilename,
    );

    filters = yaml.safeLoad(fs.readFileSync(acceptLocation, 'utf8'));
  }
  if (config.BROKER_BOOT_MODE != 'universal') {
    // If user brings an accept json, skip the IAC|CODE rules injection logic
    // If going through the effort of loading a separate file, add your rules there
    if (process.env.ACCEPT === 'accept.json') {
      filters = injectRulesAtRuntime(filters);
    } else {
      logger.info(
        { accept: process.env.ACCEPT },
        'Custom accept json, skipping filter rule injection',
      );
    }
  } else {
    const brokerTypes = config.BROKER_TYPES.split(',');
    brokerTypes.forEach((type) => {
      filters[type] = yaml.safeLoad(
        fs.readFileSync(
          `${path.resolve(
            process.cwd(),
            // can put the paths to the default accept json under filter_rules_path: { github: /path/to/acceptjson }
            config['FILTER_RULES_PATHS'][`${type.toUpperCase()}`] ||
              `client-templates/${type}/accept.json.sample`,
          )}`,
          'utf8',
        ),
      );
      filters[type] = injectRulesAtRuntime(filters[type]);
    });
  }
  return filters;
};
