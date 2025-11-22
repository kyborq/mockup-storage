import uuid from "../utils/uuid";

/**
 * Represents a view of a record, combining the record data with a unique ID.
 * @template T - The type of the record data.
 */
export type MockView<T> = T & {
  id: string;
};

/**
 * A map defining supported types for mock records.
 */
export type MockRecordTypeMap = {
  string: string;
  number: number;
  boolean: boolean;
  datetime: Date;
};

/**
 * Schema definition for mock records where keys are field names and values are types from MockRecordTypeMap.
 */
export type MockRecordSchema = Record<string, keyof MockRecordTypeMap>;

/**
 * Infers the actual data types from a given schema S.
 */
export type InferSchemaType<S extends MockRecordSchema> = {
  [K in keyof S]: MockRecordTypeMap[S[K]];
};

/**
 * A mock record that stores data and provides a view with a unique ID.
 * @template T - The type of the record data.
 */
export class MockRecord<T extends MockRecordSchema> {
  private id: string;
  private record: InferSchemaType<T>;
  private schema?: T;

  /**
   * Creates a new `MockRecord` instance.
   * @param record - The data to store in the record.
   * @param schema - The schema defining the structure and types of the record.
   * @param id - Optional ID for the record (used when loading from storage)
   */
  constructor(record: InferSchemaType<T>, schema?: T, id?: string) {
    this.id = id || uuid();
    this.schema = schema;

    if (schema) {
      this.validateRecord(record, schema);
    }

    this.record = record;
  }

  /**
   * Validates the record against the schema.
   * Ensures all fields are of the expected type defined in the schema.
   * @param record - The data to validate.
   * @param schema - The schema to validate against.
   * @throws Error if validation fails.
   */
  private validateRecord(record: InferSchemaType<T>, schema: T): void {
    for (const key of Object.keys(schema) as (keyof T)[]) {
      const expectedType = schema[key];
      const value = record[key];

      if (!this.isValidType(value, expectedType)) {
        throw new Error(
          `Validation error: Field "${String(
            key
          )}" is expected to be of type "${expectedType}", but got "${typeof value}".`
        );
      }
    }
  }

  /**
   * Checks if a value matches the expected type from the schema.
   * @param value - The value to check.
   * @param expectedType - The expected type from the schema.
   * @returns True if the value matches the type, otherwise false.
   */
  private isValidType(
    value: any,
    expectedType: keyof MockRecordTypeMap
  ): boolean {
    switch (expectedType) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number";
      case "boolean":
        return typeof value === "boolean";
      case "datetime":
        return value instanceof Date;
      default:
        return false;
    }
  }

  /**
   * Validates the current record instance against its schema.
   * @throws Error if validation fails.
   */
  public validate(): void {
    if (!this.schema) {
      throw new Error("No schema defined for validation.");
    }

    this.validateRecord(this.record, this.schema);
  }

  /**
   * Retrieves the record as a `MockView<T>`, including its unique ID.
   * @returns The record view with the ID and data.
   */
  public view(): MockView<InferSchemaType<T>> {
    return { id: this.id, ...this.record };
  }
}
