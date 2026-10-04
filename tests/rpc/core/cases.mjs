import { readdir } from 'node:fs/promises';

const root = new URL('../tools/', import.meta.url);
const caseName = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

export async function listCases(directory = root, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = [];
  for (const entry of entries) {
    if (entry.isDirectory()) names.push(...await listCases(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`));
    else if (entry.isFile() && entry.name.endsWith('.mjs')) names.push(`${prefix}${entry.name.slice(0, -4)}`);
  }
  return names.sort();
}

export async function loadCase(name) {
  if (!caseName.test(name)) throw new Error(`Invalid test name: ${name}`);
  const available = await listCases();
  if (!available.includes(name)) throw new Error(`Unknown test: ${name}. Use --list to see available tests.`);
  const module = await import(new URL(`${name}.mjs`, root));
  if (typeof module.default !== 'function') throw new Error(`Test ${name} must export a default async function`);
  return { run: module.default, writes: module.writes !== false };
}
