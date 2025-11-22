/**
 * Index system for fast field lookups using B-Tree
 */

import { BTree } from "./btree";
import { MockRecordSchema, InferSchemaType, MockView } from "./record";

/**
 * Index type definition
 */
export type IndexType = "btree" | "hash";

/**
 * Index configuration (generic version for internal use)
 */
export interface IndexConfig {
  /** Name of the index */
  name: string;
  /** Field to index */
  field: string;
  /** Type of index (default: btree) */
  type?: IndexType;
  /** Whether index is unique */
  unique?: boolean;
}

/**
 * Type-safe index configuration
 * @template S - Schema type
 */
export type TypeSafeIndexConfig<S extends MockRecordSchema> = {
  /** Name of the index */
  name: string;
  /** Field to index - must be a field from the schema */
  field: keyof InferSchemaType<S>;
  /** Type of index (default: btree) */
  type?: IndexType;
  /** Whether index is unique */
  unique?: boolean;
}

/**
 * Index statistics
 */
export interface IndexStats {
  name: string;
  field: string;
  type: IndexType;
  unique: boolean;
  entries: number;
  memoryUsage: number;
}

/**
 * Single index implementation using B-Tree
 */
export class Index<T extends MockRecordSchema> {
  private btree: BTree<string | number | boolean | Date, string>; // Maps field value -> record ID
  private config: Required<IndexConfig>;
  private fieldName: string;
  private uniqueMap?: Map<string | number | boolean | Date, string>; // For unique indexes

  constructor(config: IndexConfig) {
    this.config = {
      type: "btree",
      unique: false,
      ...config,
    };
    this.fieldName = config.field;
    this.btree = new BTree<string | number | boolean | Date, string>(32);

    if (this.config.unique) {
      this.uniqueMap = new Map();
    }
  }

  /**
   * Adds a record to the index
   */
  public add(record: MockView<InferSchemaType<T>>): void {
    const fieldValue = record[this.fieldName as keyof typeof record] as string | number | boolean | Date | undefined | null;
    
    if (fieldValue === undefined || fieldValue === null) {
      return; // Don't index null/undefined values
    }

    // Check uniqueness constraint
    if (this.config.unique && this.uniqueMap) {
      if (this.uniqueMap.has(fieldValue)) {
        throw new Error(
          `Unique constraint violation: Value "${fieldValue}" already exists in index "${this.config.name}"`
        );
      }
      this.uniqueMap.set(fieldValue, record.id);
    }

    this.btree.insert(fieldValue, record.id);
  }

  /**
   * Removes a record from the index
   */
  public remove(record: MockView<InferSchemaType<T>>): void {
    const fieldValue = record[this.fieldName as keyof typeof record] as string | number | boolean | Date | undefined | null;
    
    if (fieldValue === undefined || fieldValue === null) {
      return;
    }

    this.btree.delete(fieldValue);
    
    if (this.uniqueMap) {
      this.uniqueMap.delete(fieldValue);
    }
  }

  /**
   * Searches for a record ID by field value
   */
  public search(value: string | number | boolean | Date): string | null {
    return this.btree.search(value);
  }

  /**
   * Searches for all record IDs within a range
   */
  public rangeSearch(min: string | number | boolean | Date, max: string | number | boolean | Date): string[] {
    const entries = this.btree.range(min, max);
    return entries.map((entry) => entry.value);
  }

  /**
   * Returns all indexed record IDs in sorted order
   */
  public getAllIds(): string[] {
    const entries = this.btree.toArray();
    return entries.map((entry) => entry.value);
  }

  /**
   * Clears the index
   */
  public clear(): void {
    this.btree.clear();
    if (this.uniqueMap) {
      this.uniqueMap.clear();
    }
  }

  /**
   * Returns index statistics
   */
  public getStats(): IndexStats {
    return {
      name: this.config.name,
      field: this.fieldName,
      type: this.config.type,
      unique: this.config.unique,
      entries: this.btree.length(),
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * Estimates memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    // Rough estimation: each entry ~100 bytes (overhead + data)
    return this.btree.length() * 100;
  }

  /**
   * Returns the field name this index is on
   */
  public getField(): string {
    return this.fieldName;
  }

  /**
   * Returns the index configuration
   */
  public getConfig(): Required<IndexConfig> {
    return { ...this.config };
  }
}

/**
 * Index manager for a collection
 */
export class IndexManager<T extends MockRecordSchema> {
  private indexes: Map<string, Index<T>> = new Map();

  /**
   * Creates a new index
   */
  public createIndex(config: IndexConfig): Index<T> {
    if (this.indexes.has(config.name)) {
      throw new Error(`Index "${config.name}" already exists`);
    }

    const index = new Index<T>(config);
    this.indexes.set(config.name, index);
    return index;
  }

  /**
   * Drops an index
   */
  public dropIndex(name: string): boolean {
    return this.indexes.delete(name);
  }

  /**
   * Gets an index by name
   */
  public getIndex(name: string): Index<T> | undefined {
    return this.indexes.get(name);
  }

  /**
   * Gets an index by field name
   */
  public getIndexByField(field: string): Index<T> | undefined {
    for (const index of this.indexes.values()) {
      if (index.getField() === field) {
        return index;
      }
    }
    return undefined;
  }

  /**
   * Lists all indexes
   */
  public listIndexes(): string[] {
    return Array.from(this.indexes.keys());
  }

  /**
   * Checks if an index exists
   */
  public hasIndex(name: string): boolean {
    return this.indexes.has(name);
  }

  /**
   * Gets statistics for all indexes
   */
  public getAllStats(): IndexStats[] {
    return Array.from(this.indexes.values()).map((index) => index.getStats());
  }

  /**
   * Rebuilds all indexes from records
   */
  public rebuildAll(records: MockView<InferSchemaType<T>>[]): void {
    // Clear all indexes
    for (const index of this.indexes.values()) {
      index.clear();
    }

    // Rebuild from records
    for (const record of records) {
      for (const index of this.indexes.values()) {
        try {
          index.add(record);
        } catch (error) {
          // Skip records that violate constraints
          console.warn(`Failed to index record ${record.id}:`, error);
        }
      }
    }
  }

  /**
   * Adds a record to all indexes
   */
  public addToIndexes(record: MockView<InferSchemaType<T>>): void {
    for (const index of this.indexes.values()) {
      try {
        index.add(record);
      } catch (error) {
        // Rollback if unique constraint is violated
        this.removeFromIndexes(record);
        throw error;
      }
    }
  }

  /**
   * Removes a record from all indexes
   */
  public removeFromIndexes(record: MockView<InferSchemaType<T>>): void {
    for (const index of this.indexes.values()) {
      index.remove(record);
    }
  }

  /**
   * Clears all indexes
   */
  public clearAll(): void {
    for (const index of this.indexes.values()) {
      index.clear();
    }
  }

  /**
   * Returns total memory usage of all indexes
   */
  public getTotalMemoryUsage(): number {
    return this.getAllStats().reduce((sum, stat) => sum + stat.memoryUsage, 0);
  }
}

