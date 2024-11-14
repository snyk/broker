import packageJson from '../../../package.json';
export default packageJson['version'] || process.env.BROKER_VERSION || 'local';
