/**
 * Unified schema system with full metadata support
 * This is now the primary and only way to define schemas
 */

import { MockRecordSchema } from "./record";

/**
 * Relation types
 */
export type RelationType =
  | "one-to-one"
  | "one-to-many"
  | "many-to-one"
  | "many-to-many";

/**
 * Relation configuration in field definition
 */
export interface FieldRelation<CollectionNames extends string = string> {
  /** Target collection name - TypeScript will autocomplete available collections */
  collection: CollectionNames;
  /** Relation type */
  type: RelationType;
  /** Cascade behavior on delete */
  onDelete?: "cascade" | "set-null" | "restrict";
}

/**
 * Field definition with complete metadata
 */
export interface FieldDefinition<CollectionNames extends string = string> {
  /** Field type */
  type: "string" | "number" | "boolean" | "datetime";
  /** Create index on this field */
  index?: boolean;
  /** Field must be unique */
  unique?: boolean;
  /** Field is required */
  required?: boolean;
  /** Default value */
  default?: any;
  /** Relation definition (for foreign keys) */
  relation?: FieldRelation<CollectionNames>;
  /** Hide field from query results (like private fields in classes) */
  hidden?: boolean;
}

/**
 * Collection schema - uses field definitions
 */
export type CollectionSchema<CollectionNames extends string = string> = Record<string, FieldDefinition<CollectionNames>>;

/**
 * Database schemas - collection name to schema mapping
 */
export type DatabaseSchemas = Record<string, CollectionSchema<any>>;

/**
 * Type-safe database schemas with autocomplete for collection names
 */
export type TypedDatabaseSchemas<T extends Record<string, CollectionSchema<keyof T & string>>> = T;

/**
 * Type helper to convert CollectionSchema to MockRecordSchema at type level
 */
export type toSimpleSchema<T extends CollectionSchema<any>> = {
  [K in keyof T]: T[K]["type"];
};

/**
 * Converts collection schema to simple MockRecordSchema format (runtime)
 */
export function toSimpleSchemaRuntime(schema: CollectionSchema<any>): MockRecordSchema {
  const simpleSchema: MockRecordSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    simpleSchema[key] = value.type;
  }
  return simpleSchema;
}

/**
 * Extracts index configurations from schema
 */
export function extractIndexConfigs(
  schema: CollectionSchema<any>
): Array<{ name: string; field: string; unique: boolean }> {
  const indexes: Array<{ name: string; field: string; unique: boolean }> = [];

  for (const [fieldName, fieldDef] of Object.entries(schema)) {
    if (fieldDef.index || fieldDef.unique) {
      indexes.push({
        name: `${fieldName}_idx`,
        field: fieldName,
        unique: fieldDef.unique || false,
      });
    }
  }

  return indexes;
}

/**
 * Extracts relation configurations from schema
 */
export function extractRelationConfigs(
  collectionName: string,
  schema: CollectionSchema<any>
): Array<{
  name: string;
  sourceCollection: string;
  targetCollection: string;
  sourceField: string;
  targetField: string;
  type: RelationType;
  onDelete?: "cascade" | "set-null" | "restrict";
}> {
  const relations: Array<{
    name: string;
    sourceCollection: string;
    targetCollection: string;
    sourceField: string;
    targetField: string;
    type: RelationType;
    onDelete?: "cascade" | "set-null" | "restrict";
  }> = [];

  for (const [fieldName, fieldDef] of Object.entries(schema)) {
    if (fieldDef.relation) {
      relations.push({
        name: `${collectionName}_${fieldName}_${fieldDef.relation.collection}`,
        sourceCollection: collectionName,
        targetCollection: fieldDef.relation.collection,
        sourceField: fieldName,
        targetField: "id", // By convention, relations point to ID
        type: fieldDef.relation.type,
        onDelete: fieldDef.relation.onDelete || "restrict",
      });
    }
  }

  return relations;
}

/**
 * Type helper to infer TypeScript type from field type
 */
type InferFieldType<T extends FieldDefinition["type"]> = T extends "string"
  ? string
  : T extends "number"
  ? number
  : T extends "boolean"
  ? boolean
  : T extends "datetime"
  ? Date
  : never;

/**
 * Type helper to determine if field is required
 */
type IsRequired<T extends FieldDefinition<any>> = T["required"] extends true ? true : false;

/**
 * Type helper to infer record type from collection schema
 * Handles required and optional fields correctly
 */
export type InferRecordType<T extends CollectionSchema<any>> = {
  [K in keyof T as IsRequired<T[K]> extends true ? K : never]: InferFieldType<T[K]["type"]>;
} & {
  [K in keyof T as IsRequired<T[K]> extends true ? never : K]?: InferFieldType<T[K]["type"]>;
};

/**
 * Type helper to check if field is hidden
 */
type IsHidden<T extends FieldDefinition<any>> = T["hidden"] extends true ? true : false;

/**
 * Type helper to infer visible record type (excluding hidden fields)
 */
export type InferVisibleRecordType<T extends CollectionSchema<any>> = {
  [K in keyof T as IsHidden<T[K]> extends true ? never : (IsRequired<T[K]> extends true ? K : never)]: InferFieldType<T[K]["type"]>;
} & {
  [K in keyof T as IsHidden<T[K]> extends true ? never : (IsRequired<T[K]> extends true ? never : K)]?: InferFieldType<T[K]["type"]>;
};

/**
 * Extracts hidden field names from schema
 */
export function extractHiddenFields(schema: CollectionSchema<any>): string[] {
  const hiddenFields: string[] = [];
  
  for (const [fieldName, fieldDef] of Object.entries(schema)) {
    if (fieldDef.hidden === true) {
      hiddenFields.push(fieldName);
    }
  }
  
  return hiddenFields;
}

/**
 * Filters out hidden fields from a record
 */
export function filterHiddenFields<T extends Record<string, any>>(
  record: T,
  hiddenFields: string[]
): Omit<T, string> {
  const filtered = { ...record };
  
  for (const field of hiddenFields) {
    delete filtered[field];
  }
  
  return filtered;
}
