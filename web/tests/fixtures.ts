import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeFlights } from '@/data/flight';
import type { FlightsFile, InsightsFile, MetaFile, SitesFile } from '@/data/schema.gen';

/** Dossier des données synthétiques commitées. */
export const FIXTURES_DIR = join(import.meta.dirname, 'fixtures/data');

export function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8')) as T;
}

function hashed(prefix: string): string {
  const name = readdirSync(FIXTURES_DIR).find((f) => new RegExp(`^${prefix}\\.[0-9a-f]+\\.json$`).test(f));
  if (!name) throw new Error(`Fixture ${prefix} introuvable`);
  return name;
}

export const fixtureMeta = (): MetaFile => readFixture<MetaFile>('meta.json');
export const fixtureFlightsFile = (): FlightsFile => readFixture<FlightsFile>(hashed('flights'));
export const fixtureSitesFile = (): SitesFile => readFixture<SitesFile>(hashed('sites'));
export const fixtureFlights = () => decodeFlights(fixtureFlightsFile());
export const fixtureInsights = (file: string): InsightsFile => readFixture<InsightsFile>(file);
