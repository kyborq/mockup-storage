import { Mutex } from "async-mutex";
import { MockRecord, MockView } from "./record";

/**
 * A filter function type that determines whether a record should be included.
 * @template T - The type of the record data.
 * @param record - The record to evaluate.
 * @returns `true` if the record should be included, otherwise `false`.
 */
export type MockFilter<T> = (record: MockView<T>) => boolean;

/**
 * A collection of mock records that supports insertion, retrieval, filtering, and deletion.
 * @template T - The type of the record data.
 */
export class MockCollection<T> {
  private mutex = new Mutex();

  private records: Map<string, MockRecord<T>>;
  private onModifyCallbacks: (() => void)[] = [];

  /**
   * Creates a new `MockCollection` instance.
   */
  constructor() {
    this.records = new Map<string, MockRecord<T>>();
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
   * Initializes the collection with data
   * @param data - Array of record views to initialize
   */
  public async init(data: MockView<T>[]): Promise<void> {
    const release = await this.mutex.acquire();

    try {
      this.records.clear();
      data.forEach((view) => {
        const { id, ...rest } = view;
        const record = new MockRecord<T>({ id, ...(rest as T) });
        this.records.set(id, record);
      });
      this.triggerModify();
    } finally {
      release();
    }
  }

  /**
   * Adds a new record to the collection
   * @param value - The data to store in the record
   * @returns Promise resolving to the added record view
   */
  public async add(value: T): Promise<MockView<T>> {
    const release = await this.mutex.acquire();

    try {
      const record = new MockRecord<T>(value);
      const view = record.view();
      this.records.set(view.id, record);
      this.triggerModify();
      return view;
    } finally {
      release();
    }
  }

  /**
   * Retrieves all records in the collection
   * @returns Promise resolving to array of record views
   */
  public async all(): Promise<MockView<T>[]> {
    const release = await this.mutex.acquire();

    try {
      return Array.from(this.records.values()).map((record) => record.view());
    } finally {
      release();
    }
  }

  /**
   * Finds records that match the given filter condition
   * @param callback - Filter function to determine matches
   * @returns Promise resolving to array of matching records
   */
  public async find(callback: MockFilter<T>): Promise<MockView<T>[]> {
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
   * Finds the first record matching the filter condition
   * @param callback - Filter function to determine match
   * @returns Promise resolving to found record or null
   */
  public async first(callback: MockFilter<T>): Promise<MockView<T> | null> {
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
   * Filters the collection in place based on callback
   * @param callback - Filter function to determine which records to keep
   */
  public async filter(callback: MockFilter<T>): Promise<void> {
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

  /**
   * Retrieves a record by its ID
   * @param id - ID of the record to retrieve
   * @returns Promise resolving to found record or null
   */
  public async get(id: string): Promise<MockView<T> | null> {
    const release = await this.mutex.acquire();

    try {
      const record = this.records.get(id);
      return record ? record.view() : null;
    } finally {
      release();
    }
  }

  /**
   * Removes a record from the collection by ID
   * @param id - ID of the record to remove
   * @returns Promise resolving to boolean indicating success
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
}
