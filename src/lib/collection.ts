import { Mutex } from "async-mutex";
import {
  MockRecord,
  MockView,
  MockRecordSchema,
  InferSchemaType,
} from "./record";
import { BTree } from "./btree";
import { IndexManager, IndexConfig, TypeSafeIndexConfig } from "./index";
import {
  CollectionSchema,
  toSimpleSchemaRuntime,
  extractIndexConfigs,
  extractHiddenFields,
  filterHiddenFields,
} from "./schema";

/**
 * A filter function type that determines whether a record should be included.
 * @template T - The type of the record data.
 * @param record - The record to evaluate.
 * @returns `true` if the record should be included, otherwise `false`.
 */
export type MockFilter<T> = (record: MockView<T>) => boolean;

/**
 * Query plan for optimized execution
 */
interface QueryPlan {
  useIndex: boolean;
  indexName?: string;
  estimatedCost: number;
}

/**
 * A collection of mock records that supports insertion, retrieval, filtering, and deletion.
 * Uses B-Tree for efficient storage and supports indexes for fast lookups.
 * @template S - The schema of the records.
 */
export class MockCollection<S extends MockRecordSchema> {
  private mutex = new Mutex();
  private btree: BTree<string, MockRecord<S>>; // ID -> Record
  private indexManager: IndexManager<S>;
  private schema: S;
  private onModifyCallbacks: (() => void)[] = [];
  private autoIndexesCreated: boolean = false;
  private hiddenFields: string[] = [];

  /**
   * Creates a new `MockCollection` instance.
   * @param schema - The collection schema with field definitions
   */
  constructor(schema: S | CollectionSchema<any>) {
    // Convert collection schema to simple format for internal use
    this.schema = toSimpleSchemaRuntime(schema as CollectionSchema<any>) as S;
    this.btree = new BTree<string, MockRecord<S>>(64);
    this.indexManager = new IndexManager<S>();

    // Extract hidden fields from schema
    this.hiddenFields = extractHiddenFields(schema as CollectionSchema<any>);

    // Auto-create indexes from schema
    this.initializeAutoIndexes(schema as CollectionSchema<any>);
  }

  /**
   * Initializes indexes defined in the schema
   */
  private async initializeAutoIndexes(
    schema: CollectionSchema<any>
  ): Promise<void> {
    if (this.autoIndexesCreated) return;

    const indexConfigs = extractIndexConfigs(schema);

    for (const config of indexConfigs) {
      try {
        await this.createIndex({
          name: config.name,
          field: config.field as any,
          unique: config.unique,
        });
      } catch (error) {
        console.warn(`Failed to auto-create index for ${config.field}:`, error);
      }
    }

    this.autoIndexesCreated = true;
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
   * Filters hidden fields from a record view
   * @param view - Record view to filter
   * @returns Filtered view without hidden fields
   */
  private filterHidden(
    view: MockView<InferSchemaType<S>>
  ): MockView<InferSchemaType<S>> {
    if (this.hiddenFields.length === 0) {
      return view;
    }
    return filterHiddenFields(view, this.hiddenFields) as MockView<
      InferSchemaType<S>
    >;
  }

  /**
   * Initializes the collection with data.
   * Validates records against the schema before adding them.
   * @param data - Array of record views to initialize.
   */
  public async init(data: MockView<InferSchemaType<S>>[]): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.btree.clear();
      this.indexManager.clearAll();

      data.forEach((view) => {
        const { id, ...rest } = view;
        const record = new MockRecord<S>(rest as any, this.schema, id);
        this.btree.insert(id, record);
      });

      // Rebuild indexes
      this.indexManager.rebuildAll(data);
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

      // First try to add to indexes (validates unique constraints)
      try {
        this.indexManager.addToIndexes(view);
      } catch (error) {
        // If index validation fails, don't add to B-Tree
        throw error;
      }

      // Only add to B-Tree if index validation passed
      this.btree.insert(view.id, record);

      this.triggerModify();
      return this.filterHidden(view);
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
      return this.btree
        .toArray()
        .map((entry) => this.filterHidden(entry.value.view()));
    } finally {
      release();
    }
  }

  /**
   * Retrieves all records in the collection without filtering hidden fields.
   * Used internally for persistence.
   * @returns Promise resolving to an array of record views including hidden fields.
   */
  public async allInternal(): Promise<MockView<InferSchemaType<S>>[]> {
    const release = await this.mutex.acquire();

    try {
      return this.btree.toArray().map((entry) => entry.value.view());
    } finally {
      release();
    }
  }

  /**
   * Finds records that match the given filter condition.
   * Uses indexes when possible for better performance.
   * @param callback - Filter function to determine matches.
   * @returns Promise resolving to an array of matching records.
   */
  public async find(
    callback: MockFilter<InferSchemaType<S>>
  ): Promise<MockView<InferSchemaType<S>>[]> {
    const release = await this.mutex.acquire();

    try {
      // Get all records from B-Tree and filter
      return this.btree
        .toArray()
        .map((entry) => entry.value.view())
        .filter(callback)
        .map((view) => this.filterHidden(view));
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
      const entries = this.btree.toArray();
      for (const entry of entries) {
        const view = entry.value.view();
        if (callback(view)) return this.filterHidden(view);
      }
      return null;
    } finally {
      release();
    }
  }

  /**
   * Retrieves a record by its ID.
   * O(log n) lookup using B-Tree.
   * @param id - ID of the record to retrieve.
   * @returns Promise resolving to the found record or null.
   */
  public async get(id: string): Promise<MockView<InferSchemaType<S>> | null> {
    const release = await this.mutex.acquire();

    try {
      const record = this.btree.search(id);
      return record ? this.filterHidden(record.view()) : null;
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
      // Get record before deletion for index removal
      const record = this.btree.search(id);
      if (!record) return false;

      const view = record.view();

      // Remove from B-Tree
      const result = this.btree.delete(id);

      if (result) {
        // Remove from indexes
        this.indexManager.removeFromIndexes(view);
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
      const entries = this.btree.toArray();
      const idsToRemove = entries
        .filter((entry) => !callback(entry.value.view()))
        .map((entry) => entry.key);

      for (const id of idsToRemove) {
        const record = this.btree.search(id);
        if (record) {
          this.indexManager.removeFromIndexes(record.view());
          this.btree.delete(id);
        }
      }

      this.triggerModify();
    } finally {
      release();
    }
  }

  /**
   * Creates an index on a specific field for fast lookups
   * @param config - Type-safe index configuration
   */
  public async createIndex(config: TypeSafeIndexConfig<S>): Promise<void> {
    const release = await this.mutex.acquire();

    try {
      const index = this.indexManager.createIndex({
        ...config,
        field: config.field as string,
      });

      // Build index from existing records
      const records = this.btree.toArray().map((entry) => entry.value.view());
      for (const record of records) {
        try {
          index.add(record);
        } catch (error) {
          // Skip records that violate constraints
          console.warn(`Failed to index record ${record.id}:`, error);
        }
      }
    } finally {
      release();
    }
  }

  /**
   * Drops an index
   * @param name - Index name to drop
   */
  public async dropIndex(name: string): Promise<boolean> {
    const release = await this.mutex.acquire();

    try {
      return this.indexManager.dropIndex(name);
    } finally {
      release();
    }
  }

  /**
   * Lists all indexes in the collection
   */
  public listIndexes(): string[] {
    return this.indexManager.listIndexes();
  }

  /**
   * Gets statistics about indexes
   */
  public getIndexStats() {
    return this.indexManager.getAllStats();
  }

  /**
   * Searches for a record by indexed field value
   * O(log n) lookup when index exists, O(n) fallback otherwise
   * @param field - Field name to search (type-safe)
   * @param value - Value to search for
   */
  public async findByField<K extends keyof InferSchemaType<S>>(
    field: K,
    value: InferSchemaType<S>[K]
  ): Promise<MockView<InferSchemaType<S>> | null> {
    const release = await this.mutex.acquire();

    try {
      const index = this.indexManager.getIndexByField(field as string);

      if (index) {
        // Use index for O(log n) lookup
        const id = index.search(value);
        if (id) {
          const record = this.btree.search(id);
          return record ? this.filterHidden(record.view()) : null;
        }
        return null;
      }

      // Fallback to linear search
      return this.first((record) => (record as any)[field] === value);
    } finally {
      release();
    }
  }

  /**
   * Finds all records with field value in a range
   * Requires an index on the field
   * @param field - Field name (type-safe)
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   */
  public async findByRange<K extends keyof InferSchemaType<S>>(
    field: K,
    min: InferSchemaType<S>[K],
    max: InferSchemaType<S>[K]
  ): Promise<MockView<InferSchemaType<S>>[]> {
    const release = await this.mutex.acquire();

    try {
      const index = this.indexManager.getIndexByField(field as string);

      if (!index) {
        throw new Error(
          `No index found on field "${String(
            field
          )}". Create an index first for range queries.`
        );
      }

      const ids = index.rangeSearch(min, max);
      const results: MockView<InferSchemaType<S>>[] = [];

      for (const id of ids) {
        const record = this.btree.search(id);
        if (record) {
          results.push(this.filterHidden(record.view()));
        }
      }

      return results;
    } finally {
      release();
    }
  }

  /**
   * Returns the collection schema
   */
  public getSchema(): S {
    return this.schema;
  }

  /**
   * Returns collection statistics
   */
  public async getStats() {
    const release = await this.mutex.acquire();

    try {
      return {
        recordCount: this.btree.length(),
        indexCount: this.indexManager.listIndexes().length,
        indexMemoryUsage: this.indexManager.getTotalMemoryUsage(),
        indexes: this.indexManager.getAllStats(),
      };
    } finally {
      release();
    }
  }

  /**
   * Performs an INNER JOIN with another collection
   * Returns only records that have matching records in both collections
   * @param targetCollection - Collection to join with
   * @param sourceField - Field in this collection (foreign key)
   * @param targetField - Field in target collection (usually 'id')
   */
  public async innerJoin<T extends MockRecordSchema>(
    targetCollection: MockCollection<T>,
    sourceField: keyof InferSchemaType<S>,
    targetField: keyof InferSchemaType<T> = "id" as keyof InferSchemaType<T>
  ): Promise<
    Array<
      MockView<InferSchemaType<S>> & { joined: MockView<InferSchemaType<T>> }
    >
  > {
    const sourceRecords = await this.all();
    const results: Array<
      MockView<InferSchemaType<S>> & { joined: MockView<InferSchemaType<T>> }
    > = [];

    for (const sourceRecord of sourceRecords) {
      const foreignKeyValue = (sourceRecord as any)[sourceField];

      const targetRecord = await targetCollection.findByField(
        targetField,
        foreignKeyValue
      );

      if (targetRecord) {
        results.push({
          ...sourceRecord,
          joined: targetRecord,
        });
      }
    }

    return results;
  }

  /**
   * Performs a LEFT JOIN with another collection
   * Returns all records from source, with matched target records (or null)
   * @param targetCollection - Collection to join with
   * @param sourceField - Field in this collection (foreign key)
   * @param targetField - Field in target collection (usually 'id')
   */
  public async leftJoin<T extends MockRecordSchema>(
    targetCollection: MockCollection<T>,
    sourceField: keyof InferSchemaType<S>,
    targetField: keyof InferSchemaType<T> = "id" as keyof InferSchemaType<T>
  ): Promise<
    Array<
      MockView<InferSchemaType<S>> & {
        joined: MockView<InferSchemaType<T>> | null;
      }
    >
  > {
    const sourceRecords = await this.all();
    const results: Array<
      MockView<InferSchemaType<S>> & {
        joined: MockView<InferSchemaType<T>> | null;
      }
    > = [];

    for (const sourceRecord of sourceRecords) {
      const foreignKeyValue = (sourceRecord as any)[sourceField];

      const targetRecord = await targetCollection.findByField(
        targetField,
        foreignKeyValue
      );

      results.push({
        ...sourceRecord,
        joined: targetRecord || null,
      });
    }

    return results;
  }

  /**
   * Gets related records from another collection
   * @param targetCollection - Collection to get related records from
   * @param sourceField - Field in this collection
   * @param targetField - Field in target collection to match
   * @param sourceValue - Value to match (if not provided, gets all relations)
   */
  public async getRelated<T extends MockRecordSchema>(
    targetCollection: MockCollection<T>,
    sourceField: keyof InferSchemaType<S>,
    targetField: keyof InferSchemaType<T>,
    sourceValue?: any
  ): Promise<MockView<InferSchemaType<T>>[]> {
    if (sourceValue !== undefined) {
      return targetCollection.find(
        (record) => (record as any)[targetField] === sourceValue
      );
    }

    // Get all unique values from source field
    const sourceRecords = await this.all();
    const uniqueValues = new Set(
      sourceRecords
        .map((record) => (record as any)[sourceField])
        .filter((v) => v != null)
    );

    const results: MockView<InferSchemaType<T>>[] = [];
    for (const value of uniqueValues) {
      const related = await targetCollection.find(
        (record) => (record as any)[targetField] === value
      );
      results.push(...related);
    }

    return results;
  }
}
