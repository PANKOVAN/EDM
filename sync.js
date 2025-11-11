import path from 'path';
import { fileURLToPath } from 'url';
import edm from './server/edm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dirname = process.argv[2] || path.join(__dirname, '..');

await edm.sync(dirname);
