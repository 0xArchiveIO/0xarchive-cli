import { readFileSync, readdirSync } from 'node:fs';
import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { program } from '../src/cli.js';
import { SDK_FLOOR, VALID_EXCHANGES } from '../src/lib/client.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

describe('release metadata', () => {
  it('pins the SDK floor the commands check for', () => {
    expect(pkg.dependencies['@0xarchive/sdk']).toBe(`^${SDK_FLOOR}`);
  });

  it('opens the changelog with the package version', () => {
    expect(changelog.match(/^## (\d+\.\d+\.\d+)/m)?.[1]).toBe(pkg.version);
  });

  it('ships only the allowlisted paths', () => {
    expect(pkg.files).toEqual(['dist', 'README.md']);
  });

  it('documents every --exchange value in the venue scopes', () => {
    for (const exchange of VALID_EXCHANGES) {
      expect(readme).toContain(`--exchange ${exchange}`);
    }
  });

  it('presents Robinhood Chain as a Lighter deployment', () => {
    expect(readme).toContain('Lighter has two deployments: mainnet and Robinhood Chain.');
  });

  it('states the Robinhood Chain liquidations floor the API serves', () => {
    expect(readme).toContain('Trades and liquidations from 2026-06-26 20:10:26 UTC');
    expect(readme).toContain('Lighter on Robinhood Chain liquidations from 2026-06-26 20:10:26 UTC');
    expect(changelog).toContain('Trades and liquidations are served from 2026-06-26 20:10:26 UTC');
    for (const doc of [readme, changelog]) {
      expect(doc).not.toMatch(/liquidations,? (order book|and order book)[^.]*2026-08-22/);
      expect(doc).not.toContain('Robinhood Chain liquidations from 2026-08-22');
    }
  });

  it('names the venue Lighter, not Lighter.xyz, in the help, README, changelog, and source', () => {
    const help: string[] = [];
    const walk = (command: Command) => {
      help.push(command.helpInformation());
      for (const sub of command.commands) walk(sub);
    };
    walk(program);
    const sources = readdirSync(new URL('../src/', import.meta.url), { recursive: true })
      .filter((file) => String(file).endsWith('.ts'))
      .map((file) => readFileSync(new URL(`../src/${String(file)}`, import.meta.url), 'utf8'));
    for (const text of [...help, readme, changelog, ...sources]) {
      expect(text).not.toMatch(/Lighter\.xyz/i);
    }
    expect(help.join('\n')).toContain('Lighter');
  });

  it('keeps em dashes out of the help text', () => {
    const help: string[] = [];
    const walk = (command: Command) => {
      help.push(command.helpInformation());
      for (const sub of command.commands) walk(sub);
    };
    walk(program);
    expect(help.join('\n')).not.toContain('\u2014');
  });
});
