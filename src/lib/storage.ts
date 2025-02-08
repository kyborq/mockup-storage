import { MockCollection } from "./collection";
import { MockPersist, MockPersistConfig, MockPersistOptions } from "./persist";

/**
 * Configuration for storage initialization
 */
interface MockStorageConfig {
  /**
   * Default persistence options for collections
   * @default { rewriteOnCommit: true }
   */
  persistOptions?: MockPersistOptions;
}

/**
 * Central storage manager for mock collections with persistence
 */
export class MockStorage {
  private collections: Map<string, MockCollection<any>>;
  private persisters: Map<string, MockPersist<any>>;
  private defaultPersistOptions: MockPersistOptions;

  constructor(config: MockStorageConfig = {}) {
    this.collections = new Map();
    this.persisters = new Map();
    this.defaultPersistOptions =
      config.persistOptions ||
      {
        // Defaults here
      };
  }

  /**
   * Gets or creates a collection with persistence
   * @template T - Data type for the collection
   * @param name - Unique name for the collection
   * @param options - Optional persistence options for this collection
   * @returns Promise resolving to requested collection
   */
  public async collection<T>(
    name: string,
    options?: MockPersistOptions
  ): Promise<MockCollection<T>> {
    await this.emulateAsyncDelay();

    if (!this.collections.has(name)) {
      const collection = new MockCollection<T>();
      const persistConfig: MockPersistConfig<T> = {
        name,
        collection,
        options: { ...this.defaultPersistOptions, ...options },
      };
      const persist = new MockPersist<T>(persistConfig);

      try {
        await persist.pull();
      } catch (error) {
        console.warn(`Failed to initialize collection ${name}:`, error);
      }

      this.collections.set(name, collection);
      this.persisters.set(name, persist);
    }

    return this.collections.get(name) as MockCollection<T>;
  }

  /**
   * Updates persistence options for a collection
   * @param name - Collection name
   * @param options - New persistence options
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
   * Commits changes to a specific collection
   * @param name - Name of the collection to commit
   */
  public async commit(name: string): Promise<void> {
    await this.emulateAsyncDelay();
    const persist = this.persisters.get(name);
    if (!persist) throw new Error(`Collection ${name} not found`);
    await persist.commit();
  }

  /**
   * Commits changes to all managed collections
   */
  public async commitAll(): Promise<void> {
    await this.emulateAsyncDelay();
    const commitPromises = Array.from(this.persisters.values()).map((p) =>
      p.commit()
    );
    await Promise.all(commitPromises);
  }

  private emulateAsyncDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 10));
  }
}
