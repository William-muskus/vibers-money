/**
 * Load .env before any other local modules run, so process.env is set when
 * spawner (and others) read LOCAL_LLM_API_BASE etc. at module load time.
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../../.env');
config({ path: envPath });
