import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');
const webuiDir = path.resolve(__dirname, '../');

function getGitHash() {
  // Docker build may pass GIT_HASH as build-arg / env variable
  if (process.env.GIT_HASH) return process.env.GIT_HASH;
  try {
    return execSync('git rev-parse --short HEAD', { cwd: rootDir }).toString().trim();
  } catch (e) {
    return null;
  }
}

function getPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(webuiDir, 'package.json'), 'utf8'));
    return pkg.version || '0.1';
  } catch (e) {
    return '0.1';
  }
}

const hash = getGitHash();
const version = getPackageVersion();
const appVersion = hash ? `${version}-${hash}` : version;

const envFilePath = path.join(webuiDir, '.env.local');
let envContent = '';

if (fs.existsSync(envFilePath)) {
  envContent = fs.readFileSync(envFilePath, 'utf8');
}

if (envContent.includes('VITE_APP_VERSION=')) {
  envContent = envContent.replace(/VITE_APP_VERSION=.*/, `VITE_APP_VERSION=${appVersion}`);
} else {
  envContent += `\nVITE_APP_VERSION=${appVersion}\n`;
}

fs.writeFileSync(envFilePath, envContent.trim() + '\n');
console.log(`Injected version: ${appVersion} into webui/.env.local`);
