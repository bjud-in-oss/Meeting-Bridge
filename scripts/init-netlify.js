/**
 * init-netlify.js
 * 
 * This script ensures that Netlify handles React Router (or general SPA routing) correctly
 * by creating a _redirects file. This is necessary because AI Studio does not support
 * creating .toml files directly, and we need to ensure deep linking works on the deployed app.
 * 
 * Usage: node init-netlify.js
 */

import fs from 'fs';
import path from 'path';

const REDIRECT_CONTENT = '/*  /index.html  200';
const FILE_NAME = '_redirects';

// We write to the 'public' directory if it exists (standard React/Vite), 
// or the root if we are in a simpler environment.
// Since this is a generated project, we'll try to put it in the root 
// so it gets picked up during the build/publish phase.

const filePath = path.resolve(process.cwd(), FILE_NAME);

try {
  fs.writeFileSync(filePath, REDIRECT_CONTENT);
  console.log(`Successfully created ${FILE_NAME} at ${filePath}`);
  console.log('Content:', REDIRECT_CONTENT);
} catch (error) {
  console.error('Error creating _redirects file:', error);
  process.exit(1);
}
