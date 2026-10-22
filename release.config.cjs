/**
 * @type {import('semantic-release').GlobalConfig}
 */
module.exports = {
  branches: 'main',
  verifyConditions: [
    '@semantic-release/github'
  ],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/exec',
      {
        prepareCmd:
          'npm run build && npm run prepare:templates && rm ./dist/client-templates/github',
      },
    ],
    // generate Cyclone DX JSON SBOM
    [
      '@semantic-release/exec',
      {
        prepareCmd:
          'mkdir -p sboms && npx snyk sbom --format cyclonedx1.4+json > sboms/broker.sbom.cyclonedx.json',
      },
    ],
    // generate Cyclone DX XML SBOM
    [
      '@semantic-release/exec',
      {
        prepareCmd:
          'mkdir -p sboms && npx snyk sbom --format cyclonedx1.4+xml > sboms/broker.sbom.cyclonedx.xml',
      },
    ],
    // generate SPDX SBOM
    [
      '@semantic-release/exec',
      {
        prepareCmd:
          'mkdir -p sboms && npx snyk sbom --format spdx2.3+json > sboms/broker.sbom.spdx.json',
      },
    ],
    // Publish via `npm publish` for CircleCI OIDC (semantic-release/npm#1121).
    ['@semantic-release/npm', { npmPublish: false }],
    ['@semantic-release/exec', { publishCmd: 'export NPM_ID_TOKEN=$(circleci run oidc get --claims \'{"aud": "npm:registry.npmjs.org"}\') && npm publish' }],
    [
      '@semantic-release/github',
      {
        assets: [
          {
            path: 'sboms/broker.sbom.cyclonedx.json',
            name: 'broker.sbom.cyclonedx.json',
            label: 'broker.sbom.cyclonedx.json',
          },
          {
            path: 'sboms/broker.sbom.cyclonedx.xml',
            name: 'broker.sbom.cyclonedx.xml',
            label: 'broker.sbom.cyclonedx.xml',
          },
          {
            path: 'sboms/broker.sbom.spdx.json',
            name: 'broker.sbom.spdx.json',
            label: 'broker.sbom.spdx.json',
          },
        ],
      },
    ],
  ],
};
