import { Mutex } from "async-mutex";
import {
  MockRecord,
  MockView,
  MockRecordSchema,
  InferSchemaType,
} from "./record";

/**
 * A filter function type that determines whether a record should be included.
 * @template T - The type of the record data.
 * @param record - The record to evaluate.
 * @returns `true` if the record should be included, otherwise `false`.
 */
export type MockFilter<T> = (record: MockView<T>) => boolean;

/**
 * A collection of mock records that supports insertion, retrieval, filtering, and deletion.
 * @template S - The schema of the records.
 */
export class MockCollection<S extends MockRecordSchema> {
  private mutex = new Mutex();
  private records: Map<string, MockRecord<S>>;
  private schema: S;
  private onModifyCallbacks: (() => void)[] = [];

  /**
   * Creates a new `MockCollection` instance.
   * @param schema - The schema defining the structure and types of records in the collection.
   */
  constructor(schema: S) {
    this.schema = schema;
    this.records = new Map<string, MockRecord<S>>();
  }

  /**
   * Registers a callback to be called when the collection is modified.
   * @param callback - Callback function
   */
  public onModify(callback: () => void): void {
    this.onModifyCallbacks.push(callback);
  }

  /**
   * Unregisters a modification callback.
   * @param callback - Callback function to remove
   */
  public offModify(callback: () => void): void {
    this.onModifyCallbacks = this.onModifyCallbacks.filter(
      (cb) => cb !== callback
    );
  }

  private triggerModify(): void {
    this.onModifyCallbacks.forEach((cb) => cb());
  }

  /**
   * Initializes the collection with data.
   * Validates records against the schema before adding them.
   * @param data - Array of record views to initialize.
   */
  public async init(data: MockView<S>[]): Promise<void> {
    const release = await this.mutex.acquire();

    try {
      this.records.clear();
      data.forEach((view) => {
        const { id, ...rest } = view;
        const record = new MockRecord<S>(rest as any, this.schema);
        this.records.set(id, record);
      });
      this.triggerModify();
    } finally {
      release();
    }
  }

  /**
   * Adds a new record to the collection.
   * @param value - The data to store in the record.
   * @returns Promise resolving to the added record view.
   * @throws Error if the record does not match the schema.
   */
  public async add(
    value: InferSchemaType<S>
  ): Promise<MockView<InferSchemaType<S>>> {
    const release = await this.mutex.acquire();

    try {
      const record = new MockRecord(value, this.schema);
      const view = record.view();
      this.records.set(view.id, record);
      this.triggerModify();
      return view;
    } finally {
      release();
    }
  }

  /**
   * Retrieves all records in the collection.
   * @returns Promise resolving to an array of record views.
   */
  public async all(): Promise<MockView<InferSchemaType<S>>[]> {
    const release = await this.mutex.acquire();

    try {
      return Array.from(this.records.values()).map((record) => record.view());
    } finally {
      release();
    }
  }

  /**
   * Finds records that match the given filter condition.
   * @param callback - Filter function to determine matches.
   * @returns Promise resolving to an array of matching records.
   */
  public async find(
    callback: MockFilter<InferSchemaType<S>>
  ): Promise<MockView<InferSchemaType<S>>[]> {
    const release = await this.mutex.acquire();

    try {
      return Array.from(this.records.values())
        .map((record) => record.view())
        .filter(callback);
    } finally {
      release();
    }
  }

  /**
   * Finds the first record matching the filter condition.
   * @param callback - Filter function to determine match.
   * @returns Promise resolving to the found record or null.
   */
  public async first(
    callback: MockFilter<InferSchemaType<S>>
  ): Promise<MockView<InferSchemaType<S>> | null> {
    const release = await this.mutex.acquire();

    try {
      for (const record of this.records.values()) {
        const view = record.view();
        if (callback(view)) return view;
      }
      return null;
    } finally {
      release();
    }
  }

  /**
   * Retrieves a record by its ID.
   * @param id - ID of the record to retrieve.
   * @returns Promise resolving to the found record or null.
   */
  public async get(id: string): Promise<MockView<InferSchemaType<S>> | null> {
    const release = await this.mutex.acquire();

    try {
      const record = this.records.get(id);
      return record ? record.view() : null;
    } finally {
      release();
    }
  }

  /**
   * Removes a record from the collection by ID.
   * @param id - ID of the record to remove.
   * @returns Promise resolving to a boolean indicating success.
   */
  public async remove(id: string): Promise<boolean> {
    const release = await this.mutex.acquire();

    try {
      const result = this.records.delete(id);
      if (result) {
        this.triggerModify();
      }
      return result;
    } finally {
      release();
    }
  }

  /**
   * Filters the collection in place based on the callback.
   * @param callback - Filter function to determine which records to keep.
   */
  public async filter(callback: MockFilter<InferSchemaType<S>>): Promise<void> {
    const release = await this.mutex.acquire();

    try {
      const idsToRemove = Array.from(this.records.entries())
        .filter(([_, record]) => !callback(record.view()))
        .map(([id]) => id);

      idsToRemove.forEach((id) => this.records.delete(id));
      this.triggerModify();
    } finally {
      release();
    }
  }
}
