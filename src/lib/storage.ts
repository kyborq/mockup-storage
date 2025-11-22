import path from "path";
import fs from "fs/promises";

import { MockCollection } from "./collection";
import { MockPersist, MockPersistConfig, MockPersistOptions } from "./persist";
import { DEFAULT_DB_PATH } from "../constants";
import { MockRecordSchema, MockView } from "./record";
import { RelationManager, RelationConfig, Relation } from "./relations";
import {
  DatabaseSchemas,
  CollectionSchema,
  toSimpleSchema,
  toSimpleSchemaRuntime,
  extractRelationConfigs,
  InferRecordType,
} from "./schema";
import { DatabaseFile } from "./database-file";

/**
 * Typed wrapper for MockCollection with proper schema inference
 */
export interface TypedMockCollection<Schema extends CollectionSchema<any>> {
  add(
    value: InferRecordType<Schema>
  ): Promise<MockView<InferRecordType<Schema> & { id: string }>>;
  all(): Promise<Array<MockView<InferRecordType<Schema> & { id: string }>>>;
  allInternal(): Promise<
    Array<MockView<InferRecordType<Schema> & { id: string }>>
  >;
  find(
    filter: (
      record: MockView<InferRecordType<Schema> & { id: string }>
    ) => boolean
  ): Promise<Array<MockView<InferRecordType<Schema> & { id: string }>>>;
  first(
    filter: (
      record: MockView<InferRecordType<Schema> & { id: string }>
    ) => boolean
  ): Promise<MockView<InferRecordType<Schema> & { id: string }> | null>;
  get(
    id: string
  ): Promise<MockView<InferRecordType<Schema> & { id: string }> | null>;
  remove(id: string): Promise<boolean>;
  update(
    id: string,
    updates: Partial<InferRecordType<Schema>>
  ): Promise<MockView<InferRecordType<Schema> & { id: string }> | null>;
  findByField<K extends keyof InferRecordType<Schema>>(
    field: K,
    value: InferRecordType<Schema>[K]
  ): Promise<MockView<InferRecordType<Schema> & { id: string }> | null>;
  findByRange<K extends keyof InferRecordType<Schema>>(
    field: K,
    min: InferRecordType<Schema>[K],
    max: InferRecordType<Schema>[K]
  ): Promise<Array<MockView<InferRecordType<Schema> & { id: string }>>>;
  createIndex<K extends keyof InferRecordType<Schema>>(config: {
    name: string;
    field: K;
    unique?: boolean;
  }): Promise<void>;
  dropIndex(name: string): Promise<void>;
  listIndexes(): string[];
  getIndexStats(): Array<{
    name: string;
    field: string;
    unique: boolean;
    size: number;
  }>;
  getSchema(): MockRecordSchema;
  init(
    data: Array<MockView<InferRecordType<Schema> & { id: string }>>
  ): Promise<void>;
  onModify(callback: () => void): void;
  offModify(callback: () => void): void;

  // Join methods for relations
  innerJoin<TargetSchema extends CollectionSchema<any>>(
    targetCollection: TypedMockCollection<TargetSchema> | MockCollection<any>,
    sourceField: keyof InferRecordType<Schema>,
    targetField?: keyof InferRecordType<TargetSchema> | "id"
  ): Promise<
    Array<
      MockView<InferRecordType<Schema> & { id: string }> & {
        joined: MockView<InferRecordType<TargetSchema> & { id: string }>;
      }
    >
  >;

  leftJoin<TargetSchema extends CollectionSchema<any>>(
    targetCollection: TypedMockCollection<TargetSchema> | MockCollection<any>,
    sourceField: keyof InferRecordType<Schema>,
    targetField?: keyof InferRecordType<TargetSchema> | "id"
  ): Promise<
    Array<
      MockView<InferRecordType<Schema> & { id: string }> & {
        joined: MockView<InferRecordType<TargetSchema> & { id: string }> | null;
      }
    >
  >;

  getRelated<TargetSchema extends CollectionSchema<any>>(
    targetCollection: TypedMockCollection<TargetSchema> | MockCollection<any>,
    sourceField: keyof InferRecordType<Schema>,
    targetField: keyof InferRecordType<TargetSchema> | "id",
    sourceValue?: any
  ): Promise<Array<MockView<InferRecordType<TargetSchema> & { id: string }>>>;
}

/**
 * Configuration options for mock storage initialization
 */
export interface MockStorageConfig {
  /**
   * Default persistence options for all collections
   * @default { persist: false }
   */
  persister?: MockPersistOptions;
}

/**
 * Central storage manager for collections and persistence.
 * @template Schemas - Database schemas mapping collection names to schemas
 */
export class MockStorage<Schemas extends DatabaseSchemas> {
  private collections: Map<string, MockCollection<any>>;
  private persisters: Map<string, MockPersist<any>>;
  private config: MockStorageConfig;
  private schemas: Schemas;
  private relationManager: RelationManager;
  private relationsInitialized: boolean = false;
  private databaseFile: DatabaseFile;
  private autoCommitTimer?: NodeJS.Timeout;
  private pendingCommit: boolean = false;
  private isInitializing: boolean = false;
  private initialized: boolean = false;

  /**
   * Creates a new MockStorage instance
   * @param schemas - Database schemas with field definitions
   * @param config - Storage configuration options
   */
  constructor(schemas?: Schemas, config: MockStorageConfig = {}) {
    this.schemas = (schemas || {}) as Schemas;
    this.collections = new Map();
    this.persisters = new Map();
    this.config = {
      persister: {
        persist: false,
        autoCommit: true,
        ...config.persister,
      },
    };
    this.relationManager = new RelationManager();
    this.databaseFile = new DatabaseFile(this.config.persister?.filepath);
  }

  /**
   * Initializes all relations defined in schemas
   */
  private initializeRelations(): void {
    if (this.relationsInitialized) return;

    for (const [collectionName, schema] of Object.entries(this.schemas)) {
      const relations = extractRelationConfigs(
        collectionName,
        schema as CollectionSchema<any>
      );

      for (const relationConfig of relations) {
        const sourceCol = this.collections.get(relationConfig.sourceCollection);
        const targetCol = this.collections.get(relationConfig.targetCollection);

        if (sourceCol && targetCol) {
          try {
            this.relationManager.defineRelation({
              ...relationConfig,
              sourceCollection: sourceCol,
              targetCollection: targetCol,
            });
          } catch (error) {
            console.warn(
              `Failed to initialize relation ${relationConfig.name}:`,
              error
            );
          }
        }
      }
    }

    this.relationsInitialized = true;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    this.isInitializing = true;
    try {
      await this.databaseFile.load();

      const collectionNames = this.databaseFile.listCollections();

      for (const name of collectionNames) {
        const data = this.databaseFile.getCollection(name);
        if (data) {
          // Use existing schema if defined, otherwise use stored schema
          if (!this.schemas[name as keyof Schemas]) {
            (this.schemas as any)[name] = data.schema;
          }

          const collection = await this.collection(name as any, {
            persist: true,
          });

          // Load data into collection
          await collection.init(data.records);

          // Restore indexes
          for (const indexConfig of data.indexes) {
            try {
              await collection.createIndex({
                name: indexConfig.name,
                field: indexConfig.field as any,
                unique: indexConfig.unique,
              });
            } catch (error) {
              // Index might already exist from schema auto-creation
            }
          }
        }
      }
    } catch (error) {
      // Database file will be created on first write
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Gets or creates a collection from defined schemas
   * @param name - Collection name
   * @param options - Optional persistence options
   * @returns Promise resolving to the collection with proper typing
   */
  public async collection<Name extends keyof Schemas>(
    name: Name,
    options?: MockPersistOptions
  ): Promise<TypedMockCollection<Schemas[Name]>> {
    // Auto-initialize on first collection access
    if (!this.initialized && !this.isInitializing) {
      await this.initialize();
    }

    const collectionName = name as string;

    if (!this.collections.has(collectionName)) {
      const schema = this.schemas[collectionName];

      if (!schema) {
        throw new Error(
          `Schema for collection "${collectionName}" not found. Define it in database schemas.`
        );
      }

      const simpleSchema = toSimpleSchemaRuntime(
        schema as CollectionSchema<any>
      );
      const collection = new MockCollection(schema as CollectionSchema<any>);
      const persistConfig: MockPersistConfig<typeof simpleSchema> = {
        name: collectionName,
        collection,
        options: options || this.config.persister,
      };

      const persist = new MockPersist(persistConfig);

      // Only pull if not initializing (to avoid overwriting loaded data)
      if (!this.isInitializing) {
        await persist.pull();
      }

      this.collections.set(collectionName, collection);
      this.persisters.set(collectionName, persist);

      // Setup auto-commit if enabled
      if (this.config.persister?.autoCommit !== false) {
        collection.onModify(() => {
          this.scheduleAutoCommit();
        });
      }
    }

    // Initialize relations after all collections are created
    if (this.collections.size > 0 && !this.relationsInitialized) {
      this.initializeRelations();
    }

    return this.collections.get(collectionName)! as any as TypedMockCollection<
      Schemas[Name]
    >;
  }

  /**
   * Updates persistence configuration for a specific collection
   * @param name - Collection name
   * @param options - New persistence options to merge
   */
  public configureCollection(
    name: string,
    options: Partial<MockPersistOptions>
  ): void {
    const persist = this.persisters.get(name);
    if (persist) {
      persist.configure(options);
    }
  }

  /**
   * Commits changes for a specific collection to persistent storage
   * @param name - Collection name to commit
   * @throws {Error} If collection not found
   */
  public async commit(name: string): Promise<void> {
    const persist = this.persisters.get(name);
    if (!persist) throw new Error(`Collection ${name} not found`);
    await persist.commit();
  }

  private scheduleAutoCommit(): void {
    if (this.pendingCommit) return;

    this.pendingCommit = true;

    if (this.autoCommitTimer) {
      clearTimeout(this.autoCommitTimer);
    }

    this.autoCommitTimer = setTimeout(() => {
      this.commitAll()
        .then(() => {
          this.pendingCommit = false;
        })
        .catch((error) => {
          console.error("Auto-commit failed:", error);
          this.pendingCommit = false;
        });
    }, 100);
  }

  public async commitAll(): Promise<void> {
    for (const [name, collection] of this.collections.entries()) {
      const schema = collection.getSchema();
      // Use allInternal to get records including hidden fields
      const records = await collection.allInternal();
      const indexes = collection.listIndexes().map((idxName) => {
        const stats = collection
          .getIndexStats()
          .find((s) => s.name === idxName);
        return {
          name: idxName,
          field: stats?.field || "",
          unique: stats?.unique || false,
        };
      });

      this.databaseFile.setCollection({
        name,
        schema,
        records,
        indexes,
      });
    }

    await this.databaseFile.save();
  }

  /**
   * Gets list of all collection names in the storage
   * @returns Array of collection names
   */
  public listCollections(): string[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Checks existence of a collection in the storage
   * @param name - Collection name to check
   * @returns `true` if collection exists, `false` otherwise
   */
  public hasCollection(name: string): boolean {
    return this.collections.has(name);
  }

  public async getHealth(): Promise<{
    collections: Array<{
      collection: string;
      meta: Awaited<ReturnType<MockPersist<any>["health"]>>;
      count: number;
    }>;
    totalSize: number;
    databasePath: string;
  }> {
    const dbStats = await this.databaseFile.getStats();
    const healthInfo = await Promise.all(
      Array.from(this.collections.entries()).map(async ([name, collection]) => {
        const count = (await collection.all()).length;
        return {
          collection: name,
          meta: {},
          count,
        };
      })
    );

    return {
      collections: healthInfo,
      totalSize: dbStats.size || 0,
      databasePath: this.databaseFile.getFilePath(),
    };
  }

  /**
   * Gets health metadata for a specific collection
   * @param name - Collection name
   * @returns Health info object with:
   * - collection: Collection name
   * - meta: Persistence metadata
   * - count: Number of records in collection
   */
  public async getCollectionHealth(name: string) {
    const collection = this.collections.get(name);
    const persister = this.persisters.get(name);
    const healthMeta = persister ? await persister.health() : {};
    const count = collection ? (await collection.all()).length : 0;

    return {
      collection: name,
      meta: healthMeta,
      count,
    };
  }

  /**
   * Defines a relation between two collections
   * @template S1 - Source collection schema
   * @template S2 - Target collection schema
   * @param config - Relation configuration
   * @returns Relation instance
   */
  public defineRelation<S1 extends keyof Schemas, S2 extends keyof Schemas>(
    config: Omit<
      RelationConfig<any, any>,
      "sourceCollection" | "targetCollection"
    > & {
      sourceCollection: S1;
      targetCollection: S2;
    }
  ): Relation<any, any> {
    const sourceCol = this.collections.get(config.sourceCollection as string);
    const targetCol = this.collections.get(config.targetCollection as string);

    if (!sourceCol) {
      throw new Error(
        `Source collection "${String(config.sourceCollection)}" not found`
      );
    }
    if (!targetCol) {
      throw new Error(
        `Target collection "${String(config.targetCollection)}" not found`
      );
    }

    return this.relationManager.defineRelation({
      ...config,
      sourceCollection: sourceCol,
      targetCollection: targetCol,
    });
  }

  /**
   * Gets a relation by name
   * @param name - Relation name
   */
  public getRelation(name: string): Relation<any, any> | undefined {
    return this.relationManager.getRelation(name);
  }

  /**
   * Lists all defined relations
   */
  public listRelations(): string[] {
    return this.relationManager.listRelations();
  }

  /**
   * Validates referential integrity of all relations
   */
  public async validateRelations() {
    return this.relationManager.validateAllIntegrity();
  }

  /**
   * Gets metadata for all relations
   */
  public getRelationMetadata() {
    return this.relationManager.getAllMetadata();
  }
}
