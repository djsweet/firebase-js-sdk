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

import { expect } from 'chai';

import * as dependencies from './dependencies.json';
import {forEach} from "../../src/util/obj";
import {extractDependencies} from "./generate_deps";


describe('Dependencies', () => {
  forEach(dependencies, (api, actualDependencies) => {
    it(api, () => {
      return extractDependencies(api).then(extractedDependencies => {
        actualDependencies.sort();
        expect(extractedDependencies).to.have.members(actualDependencies);
      });
    });
  });
});
