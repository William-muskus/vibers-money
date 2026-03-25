/**
 * Print download URLs for Q4_K_M GGUF models. Save files into repo-root models/.
 * Run: npm run download-models -w @vibers/inference-engine
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODELS_DIR = process.env.MODEL_DIR || path.join(REPO_ROOT, 'models');

const FILES = [
  {
    repo: 'Jackrong/Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-GGUF',
    file: 'Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-Q4_K_M.gguf',
  },
  {
    repo: 'Jackrong/Qwen3.5-0.8B-Claude-4.6-Opus-Reasoning-Distilled-GGUF',
    file: 'Qwen3.5-0.8B-Claude-4.6-Opus-Reasoning-Distilled-Q4_K_M.gguf',
  },
];

console.log('Download these files into:', MODELS_DIR);
console.log('');
FILES.forEach(({ repo, file }) => {
  console.log(`  ${file}`);
  console.log(`  https://huggingface.co/${repo}/resolve/main/${file}`);
  console.log('');
});
console.log('Then set in .env: MODEL_PATH=models/' + FILES[0].file + ', DRAFT_MODEL_PATH=models/' + FILES[1].file);
