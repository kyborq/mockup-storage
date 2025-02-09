import path from "path";
import fs from "fs/promises";

import { MockCollection } from "./collection";
import { MockPersist, MockPersistConfig, MockPersistOptions } from "./persist";
import { MOCK_PERSIST_DIRECTORY } from "../constants";
import { InferSchemaType, MockRecordSchema, MockView } from "./record";

/**
 * Configuration for storage initialization
 */
interface MockStorageConfig {
  /**
   * Default persistence options for collections
   * @default { persist: false }
   */
  persister?: MockPersistOptions;
}

/**
 * Central storage manager for mock collections with persistence
 */
export class MockStorage<Schemas extends Record<string, MockRecordSchema>> {
  private collections: Map<
    keyof Schemas,
    MockCollection<Schemas[keyof Schemas]>
  >;
  private persisters: Map<keyof Schemas, MockPersist<any>>;
  private config: MockStorageConfig;
  private schemas: Schemas;

  constructor(schemas: Schemas, config: MockStorageConfig = {}) {
    this.schemas = schemas;
    this.collections = new Map();
    this.persisters = new Map();
    this.config = config || {
      persister: {
        persist: false,
      },
    };
  }

  /**
   * Scans the `.mock` directory for existing collection files and loads them
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
        await this.collection(collectionName as keyof Schemas, {
          persist: true,
        });
      }
    } catch (error) {
      console.error("Error initializing collections:", error);
    }
  }

  /**
   * Gets or creates a collection with persistence
   * @template K - Key of the schema in Schemas
   * @param name - Unique name for the collection
   * @param options - Optional persistence options for this collection
   * @returns Promise resolving to the requested collection
   */
  public async collection<K extends keyof Schemas>(
    name: K,
    options?: MockPersistOptions
  ): Promise<MockCollection<Schemas[K]>> {
    if (!this.collections.has(name)) {
      const schema: Schemas[K] = this.schemas[name];
      const collection = new MockCollection<Schemas[K]>(schema);

      const persistConfig: MockPersistConfig<Schemas[K]> = {
        name: name as string,
        collection,
        options: options || this.config.persister,
      };
      const persist = new MockPersist<Schemas[K]>(persistConfig);

      try {
        await persist.pull();
      } catch (error) {
        console.warn(`Failed to initialize collection ${String(name)}:`, error);
      }

      this.collections.set(name, collection);
      this.persisters.set(name, persist);
    }

    return this.collections.get(name) as MockCollection<Schemas[K]>;
  }

  /**
   * Updates persistence options for a collection
   * @param name - Collection name
   * @param options - New persistence options
   */
  public configureCollection(
    name: keyof Schemas,
    options: Partial<MockPersistOptions>
  ): void {
    const persist = this.persisters.get(name);
    if (persist) {
      persist.configure(options);
    }
  }

  /**
   * Commits changes to a specific collection
   * @param name - Name of the collection to commit
   */
  public async commit(name: keyof Schemas): Promise<void> {
    const persist = this.persisters.get(name);
    if (!persist) throw new Error(`Collection ${String(name)} not found`);
    await persist.commit();
  }

  /**
   * Commits changes to all managed collections
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
  public listCollections(): (keyof Schemas)[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Checks if a collection exists in the storage
   * @param name - Collection name to check
   * @returns `true` if collection exists, `false` otherwise
   */
  public hasCollection(name: keyof Schemas): boolean {
    return this.collections.has(name);
  }

  /**
   * Gets health information for all collections in the storage, including a summary of total size
   * @returns Object containing:
   * - collections: Array of health information in the format { collection: string, meta: health, count: number }
   * - totalSize: Total size of all persisted collections in bytes
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
          collection: name as string,
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
   * Gets health information for collection in the storage by name
   * @returns Health information in the format:
   * { collection: string, meta: health, count: number }
   */
  public async getCollectionHealth<K extends keyof Schemas>(name: K) {
    const collection = this.collections.get(name);
    const persister = this.persisters.get(name);
    const healthMeta = persister ? await persister.health() : {};
    const count = collection ? (await collection.all()).length : 0;

    return {
      collection: name as string,
      meta: healthMeta,
      count,
    };
  }
}
