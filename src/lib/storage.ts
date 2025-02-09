import path from "path";
import fs from "fs/promises";

import { MockCollection } from "./collection";
import { MockPersist, MockPersistConfig, MockPersistOptions } from "./persist";
import { MOCK_PERSIST_DIRECTORY } from "../constants";
import { MockRecordSchema } from "./record";

/**
 * Configuration options for mock storage initialization
 */
interface MockStorageConfig {
  /**
   * Default persistence options for all collections
   * @default { persist: false }
   */
  persister?: MockPersistOptions;
}

type CollectionSchemas = Record<string, MockRecordSchema>;

/**
 * Central storage manager for mock collections with optional persistence.
 * Supports both global schemas (defined at initialization) and local schemas (per collection).
 * @template Schemas - Type describing global schemas as a record of collection names to schemas
 */
export class MockStorage<Schemas extends CollectionSchemas> {
  private collections: Map<string, MockCollection<any>>;
  private persisters: Map<string, MockPersist<any>>;
  private config: MockStorageConfig;
  private schemas: Schemas;

  /**
   * Creates a new MockStorage instance
   * @param schemas - Optional global schemas definition
   * @param config - Storage configuration options
   */
  constructor(schemas?: Schemas, config: MockStorageConfig = {}) {
    this.schemas = (schemas || {}) as Schemas;
    this.collections = new Map();
    this.persisters = new Map();
    this.config = config;
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

          (this.schemas as Record<string, MockRecordSchema>)[collectionName] =
            schema;

          await this.collection(collectionName, {
            schema: schema,
            options: {
              persist: true,
            },
          });
        } catch (error) {
          console.error(`Error loading collection ${collectionName}:`, error);
        }
      }
    } catch (error) {
      console.error("Error initializing storage:", error);
    }
  }

  public async collection<Name extends keyof Schemas>(
    name: Name
  ): Promise<MockCollection<Schemas[Name]>>;

  public async collection<S extends MockRecordSchema>(
    name: string,
    config: { schema?: S; options?: MockPersistOptions }
  ): Promise<MockCollection<S>>;

  /**
   * Gets or creates a collection with local schema
   * @template S - Schema type for the collection
   * @param name - Collection name
   * @param config - Configuration with schema and persistence options
   * @returns Promise resolving to the requested collection
   */
  public async collection<
    Name extends keyof Schemas,
    S extends MockRecordSchema
  >(
    name: Name | string,
    config?: { schema?: S; options?: MockPersistOptions }
  ): Promise<MockCollection<S>> {
    const collectionName = name as string;

    if (config?.schema) {
      (this.schemas as Record<string, MockRecordSchema>)[collectionName] =
        config.schema;
    }

    if (!this.collections.has(collectionName)) {
      // Используем утверждение типа для ключа схемы
      const schema =
        config?.schema ||
        (this.schemas as Record<string, MockRecordSchema>)[collectionName];

      if (!schema) {
        throw new Error(
          `Schema for collection "${collectionName}" not found. Provide it in config or global schemas.`
        );
      }

      const collection = new MockCollection(schema);
      const persistConfig: MockPersistConfig<any> = {
        name: collectionName, // Явно передаем строку
        collection,
        options: config?.options || this.config.persister,
      };

      const persist = new MockPersist(persistConfig);
      await persist.pull();

      this.collections.set(collectionName, collection);
      this.persisters.set(collectionName, persist);
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
}
