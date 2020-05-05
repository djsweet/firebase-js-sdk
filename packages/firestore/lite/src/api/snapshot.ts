import * as firestore from '../../index';
import { Firestore } from './database';
import { DocumentKey } from '../../../src/model/document_key';
import { Document } from '../../../src/model/document';
import { UserDataWriter } from '../../../src/api/user_data_writer';
import { DocumentReference, Query } from './reference';
import { Query as InternalQuery } from '../../../src/core/query';
import { ViewSnapshot } from '../../../src/core/view_snapshot';

export class DocumentSnapshot<T = firestore.DocumentData>
  implements firestore.DocumentSnapshot {
  constructor(
    private _firestore: Firestore,
    private _key: DocumentKey,
    public _document: Document | null
  ) {}

  get exists(): boolean {
    return this._document !== null;
  }

  data(): T | undefined {
    if (!this._document) {
      return undefined;
    } else {
      const userDataWriter = new UserDataWriter(
        this._firestore._databaseId,
        /* timestampsInSnapshots= */ false,
        /* serverTimestampBehavior=*/ 'none',
        key => new DocumentReference(key, this._firestore)
      );
      return userDataWriter.convertValue(this._document.toProto()) as T;
    }
  }
}

export class QueryDocumentSnapshot<T = firestore.DocumentData>
  extends DocumentSnapshot
  implements firestore.QueryDocumentSnapshot {
  data(): T {
    return super.data() as T;
  }
}

export class QuerySnapshot<T = firestore.DocumentData>
  implements firestore.QuerySnapshot<T> {
  constructor(
    private readonly _firestore: Firestore,
    private readonly _originalQuery: InternalQuery,
    private readonly _docs: Document[]
  ) // private readonly _converter?: firestore.FirestoreDataConverter<T> // TODO: Support converter
  {}

  get docs(): Array<firestore.QueryDocumentSnapshot<T>> {
    const result: Array<firestore.QueryDocumentSnapshot<T>> = [];
    this.forEach(doc => result.push(doc));
    return result;
  }

  get empty(): boolean {
    return this._docs.length === 0;
  }

  get size(): number {
    return this._docs.length;
  }

  forEach(
    callback: (result: firestore.QueryDocumentSnapshot<T>) => void,
    thisArg?: unknown
  ): void {
    this._docs.forEach(doc => {
      callback.call(thisArg, this.convertToDocumentImpl(doc));
    });
  }

  get query(): firestore.Query<T> {
    return new Query(this._originalQuery, this._firestore);
  }

  private convertToDocumentImpl(doc: Document): QueryDocumentSnapshot<T> {
    return new QueryDocumentSnapshot(this._firestore, doc.key, doc);
  }
}
