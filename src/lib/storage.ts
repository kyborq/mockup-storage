import path from "path";
import fs from "fs/promises";

import { MockCollection } from "./collection";
import { MockPersist, MockPersistConfig, MockPersistOptions } from "./persist";
import { MOCK_PERSIST_DIRECTORY } from "../constants";
import { MockRecordSchema } from "./record";
import { RelationManager, RelationConfig, Relation } from "./relations";
import { DatabaseSchemas, CollectionSchema, toSimpleSchema, extractRelationConfigs } from "./schema";

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

  /**
   * Creates a new MockStorage instance
   * @param schemas - Database schemas with field definitions
   * @param config - Storage configuration options
   */
  constructor(schemas?: Schemas, config: MockStorageConfig = {}) {
    this.schemas = (schemas || {}) as Schemas;
    this.collections = new Map();
    this.persisters = new Map();
    this.config = config;
    this.relationManager = new RelationManager();
  }

  /**
   * Initializes all relations defined in schemas
   */
  private initializeRelations(): void {
    if (this.relationsInitialized) return;

    for (const [collectionName, schema] of Object.entries(this.schemas)) {
      const relations = extractRelationConfigs(collectionName, schema as CollectionSchema);
      
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
            console.warn(`Failed to initialize relation ${relationConfig.name}:`, error);
          }
        }
      }
    }

    this.relationsInitialized = true;
  }

  /**
   * Initializes storage by scanning the persistence directory and loading existing collections
   * @throws {Error} If filesystem access fails
   */
  public async initialize(): Promise<void> {
    const dirPath = path.join(process.cwd(), MOCK_PERSIST_DIRECTORY);

    try {
      await fs.access(dirPath);
      const files = await fs.readdir(dirPath);

      const collectionFiles = files.filter((file) =>
        file.endsWith("-collection.json")
      );

      for (const file of collectionFiles) {
        const collectionName = file.replace("-collection.json", "");
        const filePath = path.join(dirPath, file);

        try {
          const data = await fs.readFile(filePath, "utf-8");
          const { schema } = JSON.parse(data);

          (this.schemas as any)[collectionName] = schema;

          await this.collection(collectionName as any, {
            persist: true,
          });
        } catch (error) {
          console.error(`Error loading collection ${collectionName}:`, error);
        }
      }
    } catch (error) {
      console.error("Error initializing storage:", error);
    }
  }

  /**
   * Gets or creates a collection from defined schemas
   * @param name - Collection name
   * @param options - Optional persistence options
   * @returns Promise resolving to the collection
   */
  public async collection<Name extends keyof Schemas>(
    name: Name,
    options?: MockPersistOptions
  ): Promise<MockCollection<any>> {
    const collectionName = name as string;

    if (!this.collections.has(collectionName)) {
      const schema = this.schemas[collectionName];

      if (!schema) {
        throw new Error(
          `Schema for collection "${collectionName}" not found. Define it in database schemas.`
        );
      }

      const collection = new MockCollection(schema as CollectionSchema);
      const persistConfig: MockPersistConfig<any> = {
        name: collectionName,
        collection,
        options: options || this.config.persister,
      };

      const persist = new MockPersist(persistConfig);
      await persist.pull();

      this.collections.set(collectionName, collection);
      this.persisters.set(collectionName, persist);
    }

    // Initialize relations after all collections are created
    if (this.collections.size > 0 && !this.relationsInitialized) {
      this.initializeRelations();
    }

    return this.collections.get(collectionName)!;
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

  /**
   * Commits changes for all collections to persistent storage
   */
  public async commitAll(): Promise<void> {
    await Promise.all(
      Array.from(this.persisters.values()).map((p) => p.commit())
    );
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

  /**
   * Gets health metadata for all collections including persistence information
   * @returns Object with:
   * - collections: Array of health info objects
   * - totalSize: Total size of all persisted data in bytes
   */
  public async getHealth(): Promise<{
    collections: Array<{
      collection: string;
      meta: Awaited<ReturnType<MockPersist<any>["health"]>>;
      count: number;
    }>;
    totalSize: number;
  }> {
    const healthInfo = await Promise.all(
      Array.from(this.collections.entries()).map(async ([name, collection]) => {
        const persister = this.persisters.get(name);
        const healthMeta = persister ? await persister.health() : {};
        const count = (await collection.all()).length;

        return {
          collection: name,
          meta: healthMeta,
          count,
        };
      })
    );

    const totalSize = healthInfo.reduce((sum, info) => {
      return sum + (info.meta.size || 0);
    }, 0);

    return {
      collections: healthInfo,
      totalSize,
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
  public defineRelation<
    S1 extends keyof Schemas,
    S2 extends keyof Schemas
  >(
    config: Omit<RelationConfig<any, any>, "sourceCollection" | "targetCollection"> & {
      sourceCollection: S1;
      targetCollection: S2;
    }
  ): Relation<any, any> {
    const sourceCol = this.collections.get(config.sourceCollection as string);
    const targetCol = this.collections.get(config.targetCollection as string);

    if (!sourceCol) {
      throw new Error(`Source collection "${String(config.sourceCollection)}" not found`);
    }
    if (!targetCol) {
      throw new Error(`Target collection "${String(config.targetCollection)}" not found`);
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
