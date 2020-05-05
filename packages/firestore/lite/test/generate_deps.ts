/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as firestore from '../index.node';
import * as rollup from 'rollup';
import * as tmp from 'tmp';
import * as fs from 'fs';
import * as path from 'path';
import * as terser from 'terser';
import { forEach } from '../../src/util/obj';

/**
 * This functions builds a simple JS app that only depends on the provided
 * export. It then uses Rollup to gather all top-level classes and functions
 * that that the export depends on.
 *
 * @return a list of dependencies for the given export
 */
export async function extractDependencies(
  exportName: string
): Promise<string[]> {
  const input = tmp.fileSync().name;
  const output = tmp.fileSync().name;

  const beforeContent = `export { ${exportName} } from '${path.resolve(
    __dirname,
    '../../dist/lite/index.js'
  )}';`;
  fs.writeFileSync(input, beforeContent);

  // Run Rollup on the JavaScript above to produce a tree-shaken build
  const bundle = await rollup.rollup({
    input,
    external: id => id.startsWith('@firebase/')
  });
  await bundle.write({ file: output, format: 'es' });

  const afterContent = fs.readFileSync(output, 'utf-8');

  const dependencies: string[] = [];
  for (const line of afterContent.split('\n')) {
    const identifierRe = /^(?:async )?(?:function|class) ([\w\$]*)/;
    const match = line.match(identifierRe);
    if (match) {
      dependencies.push(match[1]);
    }
  }
  dependencies.sort();

  // Extract size (for debugging)
  const { code } = terser.minify(afterContent, {
    output: {
      comments: false
    },
    mangle: false,
    compress: false
  });
  console.log(
    `Exported size for '${exportName}': ${Buffer.byteLength(
      code!,
      'utf-8'
    )} bytes`
  );

  fs.unlinkSync(input);
  fs.unlinkSync(output);

  return dependencies;
}

async function buildJson(): Promise<string> {
  const result: { [key: string]: string[] } = {};

  const deps: string[] = [];
  forEach(firestore, key => {
    deps.push(key);
  });

  for (const dep of deps) {
    result[dep] = await extractDependencies(dep);
  }

  return JSON.stringify(result, null, 4);
}

buildJson().then(json => {
  fs.writeFileSync(path.resolve(__dirname, 'dependencies.json'), json);
});
