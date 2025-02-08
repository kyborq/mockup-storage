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
  private records: Map<string, MockRecord<T>>;

  /**
   * Creates a new `MockCollection` instance.
   */
  constructor() {
    this.records = new Map<string, MockRecord<T>>();
  }

  /**
   * Initializes the collection with data
   * @param data - Array of record views to initialize
   */
  public async init(data: MockView<T>[]): Promise<void> {
    await this.emulateAsyncDelay();
    this.records.clear();
    data.forEach((view) => {
      const { id, ...rest } = view;
      const record = new MockRecord<T>({ id, ...(rest as T) });
      this.records.set(id, record);
    });
  }

  /**
   * Adds a new record to the collection
   * @param value - The data to store in the record
   * @returns Promise resolving to the added record view
   */
  public async add(value: T): Promise<MockView<T>> {
    await this.emulateAsyncDelay();
    const record = new MockRecord<T>(value);
    const view = await record.view();
    this.records.set(view.id, record);
    return view;
  }

  /**
   * Retrieves all records in the collection
   * @returns Promise resolving to array of record views
   */
  public async all(): Promise<MockView<T>[]> {
    await this.emulateAsyncDelay();
    const result: MockView<T>[] = [];
    for (const record of this.records.values()) {
      result.push(await record.view());
    }
    return result;
  }

  /**
   * Finds records that match the given filter condition
   * @param callback - Filter function to determine matches
   * @returns Promise resolving to array of matching records
   */
  public async find(callback: MockFilter<T>): Promise<MockView<T>[]> {
    await this.emulateAsyncDelay();
    const result: MockView<T>[] = [];
    for (const record of this.records.values()) {
      const view = await record.view();
      if (callback(view)) {
        result.push(view);
      }
    }
    return result;
  }

  /**
   * Finds the first record matching the filter condition
   * @param callback - Filter function to determine match
   * @returns Promise resolving to found record or null
   */
  public async first(callback: MockFilter<T>): Promise<MockView<T> | null> {
    await this.emulateAsyncDelay();
    for (const record of this.records.values()) {
      const view = await record.view();
      if (callback(view)) {
        return view;
      }
    }
    return null;
  }

  /**
   * Filters the collection in place based on callback
   * @param callback - Filter function to determine which records to keep
   */
  public async filter(callback: MockFilter<T>): Promise<void> {
    await this.emulateAsyncDelay();
    const idsToRemove: string[] = [];

    for (const [id, record] of this.records) {
      const view = await record.view();
      if (!callback(view)) {
        idsToRemove.push(id);
      }
    }

    idsToRemove.forEach((id) => this.records.delete(id));
  }

  /**
   * Retrieves a record by its ID
   * @param id - ID of the record to retrieve
   * @returns Promise resolving to found record or null
   */
  public async get(id: string): Promise<MockView<T> | null> {
    await this.emulateAsyncDelay();
    const record = this.records.get(id);
    return record ? record.view() : null;
  }

  /**
   * Removes a record from the collection by ID
   * @param id - ID of the record to remove
   * @returns Promise resolving to boolean indicating success
   */
  public async remove(id: string): Promise<boolean> {
    await this.emulateAsyncDelay();
    return this.records.delete(id);
  }

  /**
   * Emulates async operation with small delay
   */
  private emulateAsyncDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 5));
  }
}
