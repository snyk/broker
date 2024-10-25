import path from 'path';
import yaml from 'js-yaml';
import fs from 'fs';

import { log as logger } from '../../logs/logger';
import { CONFIGURATION, findProjectRoot } from '../config/config';
import camelcase from 'camelcase';
import { FiltersType, Rule } from '../types/filter';

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

function injectRulesAtRuntime(
  filters: FiltersType,
  config: CONFIGURATION,
  ruleType?,
) {
  const ACCEPT_IAC = process.env.ACCEPT_IAC || config.ACCEPT_IAC;
  if (ACCEPT_IAC && (!ruleType || CODE_SCM_ORIGINS.includes(ruleType))) {
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
    } else if (!filters.private[0].origin?.includes('AZURE')) {
      // API endpoints for IAC (github, ghe, bitbucket server), doesn't matter for azure, gitlab
      // file pattern is different for Azure repos, requirements work for all others
      const template = nestedCopy(
        filters.private.filter(
          (entry) =>
            entry.method === 'GET' &&
            entry.path?.includes('requirements') &&
            IAC_SCM_ORIGINS.filter((origin) =>
              entry.origin?.includes(`{${origin}}`),
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
      const templateToModify = filters.private.filter(
        (entry) =>
          entry.method === 'GET' &&
          entry.valid &&
          entry.valid[0].values?.includes('**/requirements/*.txt'),
      );
      for (let i = 0; i < templateToModify.length; i++) {
        for (let j = 0; j < extensions.length; j++) {
          if (
            templateToModify[i].valid &&
            templateToModify[i].valid!.length > 0
          )
            templateToModify[i].valid![0].values!.push(`**/*.${extensions[j]}`);
          templateToModify[i].valid![0].values!.push(`**%2F*.${extensions[j]}`);
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
      if (filters.private[0].origin?.includes(element)) {
        return true;
      }
    });
    if (scmType === 'GITHUB') {
      logger.info(
        { accept: ACCEPT_LARGE_MANIFESTS },
        'Injecting Accept rules for Large Manifest files',
      );
      const largeManifestRule = {
        '//': 'used to get given manifest file',
        method: 'GET',
        path: '/repos/:owner/:repo/git/blobs/:sha',
        origin: 'https://${GITHUB_TOKEN}@${GITHUB_API}',
      };
      filters.private.push(...[largeManifestRule]);
    } else {
      logger.error(
        { accept: ACCEPT_LARGE_MANIFESTS },
        'Large Manifest files Rules is only applicable to Github systems',
      );
    }
  }
  const ACCEPT_CODE =
    process.env.ACCEPT_CODE ||
    process.env.ACCEPT_GIT ||
    config.ACCEPT_CODE ||
    config.ACCEPT_GIT;
  if (ACCEPT_CODE) {
    logger.info({ accept: ACCEPT_CODE }, 'Injecting Accept rules for Code/Git');

    const templateGET = nestedCopy(
      filters.private.filter(
        (entry) =>
          entry.method === 'GET' &&
          CODE_SCM_ORIGINS.filter((origin) =>
            entry.origin?.includes(`{${origin}}`),
          ).length > 0,
      )[0] || [],
    );

    if (!Array.isArray(templateGET)) {
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
      if (
        templateGET.origin == 'https://${GITHUB}' &&
        templateGET.auth.token == '${GHA_ACCESS_TOKEN}'
      ) {
        // Github app  case
        templateGET.origin = templateGET.origin.replace(
          'https://${GITHUB}',
          'https://x-access-token:${GHA_ACCESS_TOKEN}@${GITHUB}',
        );
        delete templateGET.auth;
      }
      const templatePOST = nestedCopy(templateGET);

      templatePOST.method = 'POST';

      templatePOST['//'] = 'allow git-upload-pack (for git clone)';

      // Code snippets rules
      const templateGETForSnippets = nestedCopy(
        filters.private.filter(
          (entry) =>
            entry.method === 'GET' &&
            SNIPPETS_CODE_SCM_ORIGINS.filter(
              (origin) =>
                entry.origin?.includes(`{${origin}}`) &&
                entry.auth?.token != '${JWT_TOKEN}',
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

      const DISABLE_SNIPPETS =
        process.env.DISABLE_SNIPPETS || config.DISABLE_SNIPPETS;
      if (DISABLE_SNIPPETS) {
        logger.info(
          { snippets: DISABLE_SNIPPETS },
          'Disabling snippets rules for Code/Git',
        );
        filters.private.push(...[templateGET, templatePOST]);
      } else {
        filters.private.push(
          ...[templateGET, templatePOST, templateGETForSnippets],
        );
      }
    }
  }
  const ACCEPT_APPRISK = process.env.ACCEPT_APPRISK || config.ACCEPT_APPRISK;
  if (ACCEPT_APPRISK) {
    logger.debug(
      { accept: ACCEPT_APPRISK },
      `Injecting Accept rules for AppRisk`,
    );
    const type =
      ruleType ??
      config.supportedBrokerTypes.find(
        (type) =>
          config[
            camelcase(`BROKER_DOWNSTREAM_TYPE_${type.toLocaleUpperCase()}`)
          ] == 'true',
      );
    if (type && fs.existsSync(`defaultFilters/apprisk/${type}.json`)) {
      logger.info(
        { accept: ACCEPT_APPRISK },
        `Injecting additional ${type} Accept rules for AppRisk`,
      );
      const appRiskRules = require(path.join(
        findProjectRoot(__dirname) ?? process.cwd(),
        `defaultFilters/apprisk/${type}.json`,
      )) as Rule[];
      // rm entry from filters.private if matching uri _and matching method_ in appRiskRules which takes precedence
      const appRiskRulesPathMethodPattern = appRiskRules.map(
        (x) => `${x.method}|${x.path}`,
      );
      filters.private = filters.private.filter((x) => {
        return !appRiskRulesPathMethodPattern.includes(`${x.method}|${x.path}`);
      });
      filters.private.push(...appRiskRules);
    }
  }

  const ACCEPT_CUSTOM_PR_TEMPLATES =
    process.env.ACCEPT_CUSTOM_PR_TEMPLATES || config.ACCEPT_CUSTOM_PR_TEMPLATES;
  if (ACCEPT_CUSTOM_PR_TEMPLATES) {
    logger.debug(
      { accept: ACCEPT_CUSTOM_PR_TEMPLATES },
      `Injecting Accept rules for Custom PR Templates`,
    );
    const type =
      ruleType ??
      config.supportedBrokerTypes.find(
        (type) =>
          config[
            camelcase(`BROKER_DOWNSTREAM_TYPE_${type.toLocaleUpperCase()}`)
          ] == 'true',
      );
    if (
      type &&
      fs.existsSync(`defaultFilters/customPrTemplates/${type}.json`)
    ) {
      logger.info(
        { accept: ACCEPT_CUSTOM_PR_TEMPLATES },
        `Injecting additional ${type} Accept rules for Custom PR Templates`,
      );
      const customPRTemplatesRules = require(path.join(
        findProjectRoot(__dirname) ?? process.cwd(),
        `defaultFilters/customPrTemplates/${type}.json`,
      )) as Rule[];
      // rm entry from filters.private if matching uri _and matching method_ in customPRTemplatesRules which takes precedence
      const customPRTemplatesRulesMethodPattern = customPRTemplatesRules.map(
        (x) => `${x.method}|${x.path}`,
      );
      filters.private = filters.private.filter((x) => {
        return !customPRTemplatesRulesMethodPattern.includes(
          `${x.method}|${x.path}`,
        );
      });
      filters.private.push(...customPRTemplatesRules);
    }
  }

  return filters;
}

export default (
  config: CONFIGURATION,
  folderLocation = '',
): FiltersType | Map<string, FiltersType> => {
  const acceptFilename = config.accept || '';
  // let filters = config.universalBrokerEnabled
  //   ? new Map()
  //   : { private: [], public: [] };
  let filters;
  if (config.universalBrokerEnabled) {
    filters = new Map();
    const supportedBrokerTypes = config.supportedBrokerTypes;
    supportedBrokerTypes.forEach((type) => {
      filters[type] = yaml.safeLoad(
        fs.readFileSync(
          `${path.resolve(
            findProjectRoot(__dirname) ?? process.cwd(),
            `${config.filterRulesPaths[type]}`, // this should handle the override for custom filters
          )}`,
          'utf8',
        ),
      );
      filters[type] = injectRulesAtRuntime(filters[type], config, type);
    });
  } else {
    if (acceptFilename) {
      const acceptLocation = path.resolve(
        folderLocation
          ? folderLocation
          : findProjectRoot(__dirname) ?? process.cwd(),
        acceptFilename,
      );

      filters = yaml.safeLoad(fs.readFileSync(acceptLocation, 'utf8'));
    }

    // If user brings an accept json, skip the IAC|CODE rules injection logic
    // If going through the effort of loading a separate file, add your rules there
    if (process.env.ACCEPT === 'accept.json') {
      filters = injectRulesAtRuntime(filters, config);
    } else {
      logger.info(
        { accept: process.env.ACCEPT },
        'Custom accept json, skipping filter rule injection',
      );
    }
  }
  return filters;
};

export const isUniversalFilters = (
  filters: FiltersType | Map<string, FiltersType>,
) => {
  return !Object.keys(filters).includes('public');
};
