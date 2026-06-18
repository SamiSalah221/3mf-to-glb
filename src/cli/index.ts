#!/usr/bin/env node
/**
 * 3mf-to-glb command-line entry.
 *
 *   3mf-to-glb input.3mf -o output.glb
 *   3mf-to-glb input.3mf --plate 2 --recolor "1=#FF0000,2=#00AAFF" -o output.glb
 *
 * The CLI is a thin shell over the same library the web app uses. It runs
 * fully offline; no network calls.
 */

import './nodePolyfills.js';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import {
  convertToGLB,
  parseRecolorArg,
  setDefaultDomParser,
  type FilamentRecolorMap,
  type PivotMode,
} from '../lib/index.js';

interface CliArgs {
  input: string;
  output: string;
  plate?: number;
  recolor?: FilamentRecolorMap;
  pivot?: PivotMode;
  rotation?: [number, number, number];
  showHelp: boolean;
}

const VALID_PIVOTS: readonly PivotMode[] = [
  'base-center',
  'bbox-center',
  'centroid',
  'original',
  'custom',
];

function parseRotation(raw: string): [number, number, number] {
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`--rotation expects "x,y,z" degrees, got "${raw}"`);
  }
  return [parts[0], parts[1], parts[2]];
}

const HELP = `3mf-to-glb — convert a multi-color 3MF to GLB

Usage:
  3mf-to-glb <input.3mf> [-o output.glb] [--plate N] [--recolor "1=#hex,2=#hex"]
                          [--pivot MODE] [--rotation "x,y,z"]

Options:
  -o, --output <file>     Output GLB path (default: input filename with .glb)
      --plate <id>        1-based plate id to export (default: first plate)
      --recolor <map>     Comma-separated index=hex pairs applied before export
      --pivot <mode>      Export pivot: base-center (default), bbox-center,
                          centroid, original, custom
      --rotation <x,y,z>  XYZ Euler rotation in degrees, baked into geometry
                          before the pivot. Useful for glTF Y-up reorientation
                          of a Z-up source (try "90,0,0").
  -h, --help              Show this message

Examples:
  3mf-to-glb model.3mf
  3mf-to-glb model.3mf -o recolored.glb --recolor "1=#cc0000,2=#000000"
  3mf-to-glb model.3mf --plate 2 -o plate2.glb
  3mf-to-glb model.3mf --rotation "90,0,0" -o yup.glb
`;

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = { input: '', output: '', showHelp: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        result.showHelp = true;
        break;
      case '-o':
      case '--output':
        result.output = argv[++i] ?? '';
        break;
      case '--plate':
        result.plate = Number(argv[++i]);
        if (!Number.isInteger(result.plate) || result.plate < 1) {
          throw new Error(`--plate expects a positive integer, got ${argv[i]}`);
        }
        break;
      case '--recolor':
        result.recolor = parseRecolorArg(argv[++i] ?? '');
        break;
      case '--pivot': {
        const raw = argv[++i] ?? '';
        if (!VALID_PIVOTS.includes(raw as PivotMode)) {
          throw new Error(
            `--pivot expects one of ${VALID_PIVOTS.join(', ')}, got "${raw}"`,
          );
        }
        result.pivot = raw as PivotMode;
        break;
      }
      case '--rotation':
        result.rotation = parseRotation(argv[++i] ?? '');
        break;
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown flag: ${arg}`);
        if (!result.input) result.input = arg;
        else throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }
  return result;
}

async function main(): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n\n${HELP}`);
    return 2;
  }

  if (args.showHelp || !args.input) {
    process.stdout.write(HELP);
    return args.input ? 0 : 1;
  }

  // Inject Node-side XML parser before any parse calls.
  setDefaultDomParser(new DOMParser() as unknown as { parseFromString(xml: string, mime: string): Document });

  const inputPath = resolve(args.input);
  if (extname(inputPath).toLowerCase() !== '.3mf') {
    process.stderr.write(`warning: input does not have a .3mf extension: ${inputPath}\n`);
  }

  const output =
    args.output ||
    inputPath.replace(/\.3mf$/i, '') + '.glb' ||
    basename(inputPath, extname(inputPath)) + '.glb';

  const buf = await readFile(inputPath);
  const bytes = await convertToGLB(buf, {
    plateId: args.plate,
    recolor: args.recolor,
    pivotMode: args.pivot,
    rotationEulerDeg: args.rotation,
  });
  await writeFile(output, bytes);

  process.stdout.write(`wrote ${output} (${bytes.byteLength.toLocaleString()} bytes)\n`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  },
);
