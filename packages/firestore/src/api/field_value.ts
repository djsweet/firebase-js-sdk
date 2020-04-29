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

import * as firestore from '@firebase/firestore-types';
import {
  validateArgType,
  validateAtLeastNumberOfArgs,
  validateExactNumberOfArgs,
  validateNoArgs
} from '../util/input_validation';
import { FieldTransform } from '../model/mutation';
import {
  ArrayRemoveTransformOperation,
  ArrayUnionTransformOperation,
  NumericIncrementTransformOperation,
  ServerTimestampTransform
} from '../model/transform_operation';
import { ParseContext, parseData, UserDataSource } from './user_data_reader';
import { fail } from '../util/assert';

/**
 * An opaque base class for FieldValue sentinel objects in our public API,
 * with public static methods for creating said sentinel objects.
 */
export abstract class FieldValueImpl {
  protected constructor(readonly _methodName: string) {}

  abstract toFieldTransform(context: ParseContext): FieldTransform;
}

export class DeleteFieldValueImpl extends FieldValueImpl {
  constructor() {
    super('FieldValue.delete');
  }

  toFieldTransform(): never {
    throw fail('DeleteFieldValueImpl does not have a field transform');
  }
}

export class ServerTimestampFieldValueImpl extends FieldValueImpl {
  constructor() {
    super('FieldValue.serverTimestamp');
  }

  toFieldTransform(context: ParseContext): FieldTransform {
    return new FieldTransform(context.path!, ServerTimestampTransform.instance);
  }
}

export class ArrayUnionFieldValueImpl extends FieldValueImpl {
  constructor(private readonly _elements: unknown[]) {
    super('FieldValue.arrayUnion');
  }

  toFieldTransform(context: ParseContext): FieldTransform {
    // Although array transforms are used with writes, the actual elements
    // being unioned or removed are not considered writes since they cannot
    // contain any FieldValue sentinels, etc.
    const parseContext = context.contextForDataSource(UserDataSource.Argument);
    // Check why bang is ok
    const parsedElements = this._elements.map(
      (element, i) => parseData(element, parseContext.childContextForArray(i))!
    );
    const arrayUnion = new ArrayUnionTransformOperation(parsedElements);
    return new FieldTransform(context.path!, arrayUnion);
  }
}

export class ArrayRemoveFieldValueImpl extends FieldValueImpl {
  constructor(readonly _elements: unknown[]) {
    super('FieldValue.arrayRemove');
  }

  toFieldTransform(context: ParseContext): FieldTransform {
    // Although array transforms are used with writes, the actual elements
    // being unioned or removed are not considered writes since they cannot
    // contain any FieldValue sentinels, etc.
    const parseContext = context.contextForDataSource(UserDataSource.Argument);
    const parsedElements = this._elements.map(
      (element, i) => parseData(element, parseContext.childContextForArray(i))!
    );
    const arrayUnion = new ArrayRemoveTransformOperation(parsedElements);
    return new FieldTransform(context.path!, arrayUnion);
  }
}

export class NumericIncrementFieldValueImpl extends FieldValueImpl {
  constructor(private readonly _operand: number) {
    super('FieldValue.increment');
  }

  toFieldTransform(context: ParseContext): FieldTransform {
    context.contextForMethodName(this._methodName);
    const operand = parseData(this._operand, context);
    // assert that operand isn't null
    const numericIncrement = new NumericIncrementTransformOperation(
      context.serializer,
      operand!
    );
    return new FieldTransform(context.path!, numericIncrement);
  }
}

export class FieldValue implements firestore.FieldValue {
  static delete(): FieldValueImpl {
    validateNoArgs('FieldValue.delete', arguments);
    return new DeleteFieldValueImpl();
  }

  static serverTimestamp(): FieldValueImpl {
    validateNoArgs('FieldValue.serverTimestamp', arguments);
    return new ServerTimestampFieldValueImpl();
  }

  static arrayUnion(...elements: unknown[]): FieldValueImpl {
    validateAtLeastNumberOfArgs('FieldValue.arrayUnion', arguments, 1);
    // NOTE: We don't actually parse the data until it's used in set() or
    // update() since we need access to the Firestore instance.
    return new ArrayUnionFieldValueImpl(elements);
  }

  static arrayRemove(...elements: unknown[]): FieldValueImpl {
    validateAtLeastNumberOfArgs('FieldValue.arrayRemove', arguments, 1);
    // NOTE: We don't actually parse the data until it's used in set() or
    // update() since we need access to the Firestore instance.
    return new ArrayRemoveFieldValueImpl(elements);
  }

  static increment(n: number): FieldValueImpl {
    validateArgType('FieldValue.increment', 'number', 1, n);
    validateExactNumberOfArgs('FieldValue.increment', arguments, 1);
    return new NumericIncrementFieldValueImpl(n);
  }

  isEqual(other: FieldValue): boolean {
    return this === other;
  }
}
