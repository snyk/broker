import {check} from 'k6';
import http from 'k6/http';
import {Counter, Trend} from 'k6/metrics';

function makeStages(vuFraction) {
    return [
        { duration: '30s', target: Math.floor(100 * vuFraction) },
        { duration: '30s', target: Math.floor(200 * vuFraction) },
        { duration: '30s', target: Math.floor(300 * vuFraction) },
        { duration: '30s', target: Math.floor(400 * vuFraction) },
        { duration: '30s', target: Math.floor(500 * vuFraction) },
        { duration: '30s', target: Math.floor(600 * vuFraction) },
        { duration: '60s', target: Math.floor(600 * vuFraction) },
        { duration: '30s', target: Math.floor(500 * vuFraction) },
        { duration: '30s', target: Math.floor(400 * vuFraction) },
        { duration: '30s', target: Math.floor(300 * vuFraction) },
        { duration: '30s', target: Math.floor(200 * vuFraction) },
        { duration: '30s', target: Math.floor(100 * vuFraction) },
        { duration: '30s', target: 0 },
    ]
}

const stages = [
    // ...makeStages(2),
    // ...makeStages(1),
    // ...makeStages(3/4),
    // ...makeStages(1/2),
    // ...makeStages(1/3),
    // ...makeStages(1/4),
    // ...makeStages(1/5),
    // ...makeStages(1/6),
    // ...makeStages(1/8),
    // ...makeStages(1/10),
    // ...makeStages(1/16),

    // { duration: '30s', target: 50 },
    // { duration: '60s', target: 50 },
    // { duration: '30s', target: 0 },

    // { duration: '1s', target: 8 },
    // { duration: '2s', target: 8 },
];

const targetIterations = (__ENV.K6_TARGET_ITERATIONS || 20) * 1;
const artifactoryTargetIterations = (__ENV.ARTIFACTORY_TARGET_ITERATIONS || targetIterations) * 1;
const bitbucketTargetIterations = (__ENV.BITBUCKET_TARGET_ITERATIONS || targetIterations) * 1;
const githubTargetIterations = (__ENV.GITHUB_TARGET_ITERATIONS || targetIterations) * 1;

const scenarios = {
    artifactory: {
        executor: 'constant-arrival-rate',
        exec: 'artifactory',
        duration: '120s',
        rate: artifactoryTargetIterations,
        timeUnit: '1s',
        preAllocatedVUs: 10,
        maxVUs: 150,
    },
    bitbucket: {
        executor: 'constant-arrival-rate',
        exec: 'bitbucket',
        duration: '120s',
        rate: bitbucketTargetIterations,
        timeUnit: '1s',
        preAllocatedVUs: 10,
        maxVUs: 100,
    },
    github_enterprise: {
        executor: 'constant-arrival-rate',
        exec: 'github_enterprise',
        duration: '120s',
        rate: githubTargetIterations,
        timeUnit: '1s',
        preAllocatedVUs: 10,
        maxVUs: 200,
    },
}

export const options = {
    // stages,
    batch: 300,
    batchPerHost: 300,
    discardResponseBodies: true,
    scenarios,
    ext: {
        loadimpact: {
            name: 'Broker Server',
            projectID: 3590986,
        },
    }
};

// const brokerUrl = "http://localhost:7341/broker";
const brokerUrl = "https://broker.pre-prod.snyk.io/broker";
// const brokerUrl = "http://localhost:5000/broker";

const data = {
    github_enterprise: {
        name: 'github-enterprise',
        // broker_tokens: ['456'/*, '789'*/],
        broker_tokens: ['5c3e0874-0901-4e6f-853c-a020c16963b9'],
        paths: [
            {path: 'user/orgs', status: 200},
            {path: 'user/orgs', status: 200},
            // {path: 'user/repos', status: 200},
            {path: 'user', status: 200},
            {name: 'not-found', path: 'repos/i-do-not-exist/items?path=pom.xml', status: 404},
        ],
    },
    bitbucket: {
        name: 'bitbucket',
        // broker_tokens: ['012'],
        broker_tokens: ['d9eb7f5e-9cdb-4c57-ac26-d16566661df1'],
        paths: [
            {path: 'projects', status: 200},
            {path: 'repos', status: 200},
            {path: 'plugins/servlet/applinks/whoami', status: 200},
            {name: 'not-found', path: 'projects/i-do-not-exist/repos/i-do-not-exist/browse/foo/package.json', status: 404},
        ],
    },
    artifactory: {
        name: 'artifactory',
        // broker_tokens: ['345'],
        broker_tokens: ['0233cb48-3d00-43bf-9b31-faf7e70475a9'],
        paths: [
            {name: 'spring-boot-deps', path: 'libs-release/org/springframework/boot/spring-boot-dependencies/2.7.1/spring-boot-dependencies-2.7.1.pom', status: 200},
            {name: 'npm-supports-color', path: 'npmjs-cache/supports-color/-/supports-color-7.2.0.tgz', status: 200},
            {name: 'commons-cli', path: 'jcenter-cache/commons-cli/commons-cli/1.2/commons-cli-1.2.pom', status: 200},
            {name: 'commons-cli-version-not-found', path: 'jcenter-cache/commons-cli/commons-cli/1.2/commons-cli-7.9.pom', status: 404},
        ],
    },
};

const trackers = {};

function getName(path) {
    if (path.name)
        return path.name
    else
        return path.path.replace(/[=/\\?]/g, '_')
}

for (const i in data) {
    const d = data[i];
    for (const j in d.broker_tokens) {
        const token = d.broker_tokens[j];
        for (const k in d.paths) {
            const path = d.paths[k];
            const id = `${d.name}-${token}_${getName(path)}-${path.status}`;
            trackers[id] = {
                trend: new Trend(`${id}_duration`, true),
                trendFailed: new Trend(`${id}_duration_failed`, true),
                counter: new Counter(`${id}_reqs`),
                counterFailed: new Counter(`${id}_reqs_failed`),
            };
        }
    }
}

const checkStatus = (status) => (resp) => resp.status === status;

function createExecutor(data) {
    return () => {
        const requests = [];
        const checkers = [];
        const trackerUpdates = [];
        for (const j in data.broker_tokens) {
            const token = data.broker_tokens[j];
            for (const k in data.paths) {
                const path = data.paths[k];
                requests.push(['GET', `${brokerUrl}/${token}/${path.path}`, null, {tags: {service: data.name}}])
                const check = {};
                const id = `${data.name}-${token}_${getName(path)}-${path.status}`;
                check[id] = checkStatus(path.status)
                checkers.push(check);
                trackerUpdates.push((resp) => {
                    if (resp.status === path.status) {
                        trackers[id].trend.add(resp.timings.duration)
                        trackers[id].counter.add(1)
                    } else {
                        trackers[id].trendFailed.add(resp.timings.duration)
                        trackers[id].counterFailed.add(1)
                    }
                });
            }
        }
        const responses = http.batch(requests);
        for (let i = 0; i < responses.length; i++) {
            trackerUpdates[i](responses[i]);
            check(responses[i], checkers[i]);
        }
    }
}

export const artifactory = createExecutor(data.artifactory);
export const bitbucket = createExecutor(data.bitbucket);
export const github_enterprise = createExecutor(data.github_enterprise);
