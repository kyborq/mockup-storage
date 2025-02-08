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
  public init(data: MockView<T>[]): void {
    this.records.clear();
    data.forEach((view) => {
      const { id, ...rest } = view;
      const record = new MockRecord<T>({ id, ...(rest as T) });
      this.records.set(id, record);
    });
    this.triggerModify();
  }

  /**
   * Adds a new record to the collection
   * @param value - The data to store in the record
   * @returns Promise resolving to the added record view
   */
  public add(value: T): MockView<T> {
    const record = new MockRecord<T>(value);
    const view = record.view();
    this.records.set(view.id, record);
    this.triggerModify();
    return view;
  }

  /**
   * Retrieves all records in the collection
   * @returns Promise resolving to array of record views
   */
  public all(): MockView<T>[] {
    const result: MockView<T>[] = [];
    for (const record of this.records.values()) {
      result.push(record.view());
    }
    return result;
  }

  /**
   * Finds records that match the given filter condition
   * @param callback - Filter function to determine matches
   * @returns Promise resolving to array of matching records
   */
  public find(callback: MockFilter<T>): MockView<T>[] {
    const result: MockView<T>[] = [];
    for (const record of this.records.values()) {
      const view = record.view();
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
  public first(callback: MockFilter<T>): MockView<T> | null {
    for (const record of this.records.values()) {
      const view = record.view();
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
  public filter(callback: MockFilter<T>): void {
    const idsToRemove: string[] = [];

    for (const [id, record] of this.records) {
      const view = record.view();
      if (!callback(view)) {
        idsToRemove.push(id);
      }
    }

    idsToRemove.forEach((id) => this.records.delete(id));
    this.triggerModify();
  }

  /**
   * Retrieves a record by its ID
   * @param id - ID of the record to retrieve
   * @returns Promise resolving to found record or null
   */
  public get(id: string): MockView<T> | null {
    const record = this.records.get(id);
    return record ? record.view() : null;
  }

  /**
   * Removes a record from the collection by ID
   * @param id - ID of the record to remove
   * @returns Promise resolving to boolean indicating success
   */
  public remove(id: string): boolean {
    const result = this.records.delete(id);
    if (result) {
      this.triggerModify();
    }
    return result;
  }
}
