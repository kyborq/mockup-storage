import { MockStorage } from "./lib/storage";
import { MockCollection, MockFilter } from "./lib/collection";
import { MockRecord, MockView } from "./lib/record";
import {
  MockPersist,
  MockPersistConfig,
  MockPersistOptions,
} from "./lib/persist";
import { BTree } from "./lib/btree";
import { Index, IndexManager, IndexConfig, IndexStats } from "./lib/index";
import { BinaryStorage } from "./lib/binary-storage";
import { Migration } from "./lib/migration";

export {
  // Core classes
  MockStorage,
  MockCollection,
  MockFilter,
  MockRecord,
  MockView,
  
  // Persistence
  MockPersist,
  MockPersistConfig,
  MockPersistOptions,
  
  // Data structures
  BTree,
  
  // Indexing
  Index,
  IndexManager,
  IndexConfig,
  IndexStats,
  
  // Binary storage
  BinaryStorage,
  
  // Migration utilities
  Migration,
};
