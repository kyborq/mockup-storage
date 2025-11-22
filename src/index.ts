import { MockStorage, MockStorageConfig, TypedMockCollection } from "./lib/storage";
import { MockCollection, MockFilter } from "./lib/collection";
import { MockRecord, MockView } from "./lib/record";
import {
  MockPersist,
  MockPersistConfig,
  MockPersistOptions,
} from "./lib/persist";
import { BTree } from "./lib/btree";
import {
  Index,
  IndexManager,
  IndexConfig,
  IndexStats,
  TypeSafeIndexConfig,
} from "./lib/index";
import { BinaryStorage } from "./lib/binary-storage";
import { Migration } from "./lib/migration";
import { DatabaseFile, CollectionData } from "./lib/database-file";
import {
  Relation,
  RelationManager,
  RelationConfig,
  TypedRelationConfig,
  RelationType,
  JoinType,
  JoinResult,
  createRelation,
} from "./lib/relations";
import {
  DatabaseSchemas,
  TypedDatabaseSchemas,
  CollectionSchema,
  FieldDefinition,
  FieldRelation,
  toSimpleSchema,
  extractIndexConfigs,
  extractRelationConfigs,
  extractHiddenFields,
  filterHiddenFields,
  InferRecordType,
  InferVisibleRecordType,
} from "./lib/schema";

export {
  // Core classes
  MockStorage,
  MockCollection,
  TypedMockCollection,
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
  TypeSafeIndexConfig,
  IndexStats,

  // Binary storage
  BinaryStorage,

  // Database file (single file mode)
  DatabaseFile,
  CollectionData,

  // Migration utilities
  Migration,

  // Relations and JOINs
  Relation,
  RelationManager,
  RelationConfig,
  TypedRelationConfig,
  RelationType,
  JoinType,
  JoinResult,
  createRelation,

  // Schema System
  DatabaseSchemas,
  TypedDatabaseSchemas,
  CollectionSchema,
  FieldDefinition,
  FieldRelation,
  toSimpleSchema,
  extractIndexConfigs,
  extractRelationConfigs,
  extractHiddenFields,
  filterHiddenFields,
  InferRecordType,
  InferVisibleRecordType,

  // Storage Config
  MockStorageConfig,
};
