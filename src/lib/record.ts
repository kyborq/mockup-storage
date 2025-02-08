import uuid from "../utils/uuid";

/**
 * Represents a view of a record, combining the record data with a unique ID.
 * @template T - The type of the record data.
 */
export type MockView<T> = T & {
  id: string;
};

/**
 * A mock record that stores data and provides a view with a unique ID.
 * @template T - The type of the record data.
 */
export class MockRecord<T> {
  private id: string;
  private record: T;

  /**
   * Creates a new `MockRecord` instance.
   * @param record - The data to store in the record.
   */
  constructor(record: T) {
    this.id = uuid();
    this.record = record;
  }

  /**
   * Retrieves the record as a `MockView<T>`, including its unique ID.
   * @returns The record view with the ID and data.
   */
  public view(): MockView<T> {
    return { id: this.id, ...this.record };
  }
}
