/**
 * B-Tree implementation for efficient data storage and retrieval
 * Similar to SQLite's internal structure
 */

/**
 * B-Tree node entry containing key-value pair
 */
interface BTreeEntry<K, V> {
  key: K;
  value: V;
}

/**
 * B-Tree node (can be internal or leaf)
 */
class BTreeNode<K, V> {
  public entries: BTreeEntry<K, V>[] = [];
  public children: BTreeNode<K, V>[] = [];
  public isLeaf: boolean;
  public parent: BTreeNode<K, V> | null = null;

  constructor(isLeaf: boolean = true) {
    this.isLeaf = isLeaf;
  }
}

/**
 * Comparison function for keys
 */
type Comparator<K> = (a: K, b: K) => number;

/**
 * B-Tree implementation with configurable order
 * Provides O(log n) search, insertion, and deletion
 */
export class BTree<K, V> {
  private root: BTreeNode<K, V>;
  private order: number; // Maximum number of children per node
  private comparator: Comparator<K>;
  private size: number = 0;

  /**
   * Creates a new B-Tree
   * @param order - Maximum number of children per node (default: 32)
   * @param comparator - Function to compare keys (default: natural ordering)
   */
  constructor(
    order: number = 32,
    comparator: Comparator<K> = (a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    }
  ) {
    this.order = Math.max(3, order); // Minimum order is 3
    this.comparator = comparator;
    this.root = new BTreeNode<K, V>(true);
  }

  /**
   * Returns the number of entries in the tree
   */
  public length(): number {
    return this.size;
  }

  /**
   * Inserts a key-value pair into the tree
   * @param key - The key to insert
   * @param value - The value to associate with the key
   */
  public insert(key: K, value: V): void {
    const root = this.root;

    // If root is full, split it
    if (root.entries.length === this.order - 1) {
      const newRoot = new BTreeNode<K, V>(false);
      newRoot.children.push(root);
      root.parent = newRoot;
      this.splitChild(newRoot, 0);
      this.root = newRoot;
      this.insertNonFull(newRoot, key, value);
    } else {
      this.insertNonFull(root, key, value);
    }

    this.size++;
  }

  /**
   * Inserts into a node that is not full
   */
  private insertNonFull(node: BTreeNode<K, V>, key: K, value: V): void {
    let i = node.entries.length - 1;

    if (node.isLeaf) {
      // Insert into leaf node
      node.entries.push({ key, value });
      while (i >= 0 && this.comparator(key, node.entries[i].key) < 0) {
        node.entries[i + 1] = node.entries[i];
        i--;
      }
      node.entries[i + 1] = { key, value };
    } else {
      // Find child to insert into
      while (i >= 0 && this.comparator(key, node.entries[i].key) < 0) {
        i--;
      }
      i++;

      // Check if child is full
      if (node.children[i].entries.length === this.order - 1) {
        this.splitChild(node, i);
        if (this.comparator(key, node.entries[i].key) > 0) {
          i++;
        }
      }

      this.insertNonFull(node.children[i], key, value);
    }
  }

  /**
   * Splits a full child node
   */
  private splitChild(parent: BTreeNode<K, V>, index: number): void {
    const fullChild = parent.children[index];
    const newChild = new BTreeNode<K, V>(fullChild.isLeaf);
    const midIndex = Math.floor((this.order - 1) / 2);

    // Move half of entries to new node
    newChild.entries = fullChild.entries.splice(midIndex + 1);
    const midEntry = fullChild.entries.pop()!;

    // Move children if not leaf
    if (!fullChild.isLeaf) {
      newChild.children = fullChild.children.splice(midIndex + 1);
      newChild.children.forEach((child) => (child.parent = newChild));
    }

    // Insert middle entry into parent
    parent.entries.splice(index, 0, midEntry);
    parent.children.splice(index + 1, 0, newChild);
    newChild.parent = parent;
  }

  /**
   * Searches for a value by key
   * @param key - The key to search for
   * @returns The value if found, null otherwise
   */
  public search(key: K): V | null {
    return this.searchNode(this.root, key);
  }

  /**
   * Searches within a specific node
   */
  private searchNode(node: BTreeNode<K, V>, key: K): V | null {
    let i = 0;

    // Find the first key greater than or equal to the search key
    while (i < node.entries.length && this.comparator(key, node.entries[i].key) > 0) {
      i++;
    }

    // Check if key matches
    if (i < node.entries.length && this.comparator(key, node.entries[i].key) === 0) {
      return node.entries[i].value;
    }

    // If leaf node, key not found
    if (node.isLeaf) {
      return null;
    }

    // Recurse into child
    return this.searchNode(node.children[i], key);
  }

  /**
   * Deletes a key from the tree
   * @param key - The key to delete
   * @returns true if deleted, false if not found
   */
  public delete(key: K): boolean {
    const deleted = this.deleteKey(this.root, key);
    if (deleted) {
      this.size--;
      // If root is empty after deletion, make its only child the new root
      if (this.root.entries.length === 0 && !this.root.isLeaf) {
        this.root = this.root.children[0];
        this.root.parent = null;
      }
    }
    return deleted;
  }

  /**
   * Deletes a key from a node
   */
  private deleteKey(node: BTreeNode<K, V>, key: K): boolean {
    let i = 0;

    // Find position of key
    while (i < node.entries.length && this.comparator(key, node.entries[i].key) > 0) {
      i++;
    }

    if (i < node.entries.length && this.comparator(key, node.entries[i].key) === 0) {
      // Key found in this node
      if (node.isLeaf) {
        node.entries.splice(i, 1);
        return true;
      } else {
        return this.deleteFromInternal(node, i);
      }
    } else if (!node.isLeaf) {
      // Key might be in subtree
      const isInSubtree = i < node.entries.length;
      const minEntries = Math.ceil(this.order / 2) - 1;

      if (node.children[i].entries.length <= minEntries) {
        this.fillChild(node, i);
      }

      if (i > node.entries.length) {
        return this.deleteKey(node.children[i - 1], key);
      } else {
        return this.deleteKey(node.children[i], key);
      }
    }

    return false;
  }

  /**
   * Deletes from an internal node
   */
  private deleteFromInternal(node: BTreeNode<K, V>, index: number): boolean {
    const key = node.entries[index].key;
    const minEntries = Math.ceil(this.order / 2) - 1;

    if (node.children[index].entries.length > minEntries) {
      const predecessor = this.getPredecessor(node, index);
      node.entries[index] = predecessor;
      return this.deleteKey(node.children[index], predecessor.key);
    } else if (node.children[index + 1].entries.length > minEntries) {
      const successor = this.getSuccessor(node, index);
      node.entries[index] = successor;
      return this.deleteKey(node.children[index + 1], successor.key);
    } else {
      this.mergeChildren(node, index);
      return this.deleteKey(node.children[index], key);
    }
  }

  /**
   * Gets predecessor entry
   */
  private getPredecessor(node: BTreeNode<K, V>, index: number): BTreeEntry<K, V> {
    let current = node.children[index];
    while (!current.isLeaf) {
      current = current.children[current.children.length - 1];
    }
    return current.entries[current.entries.length - 1];
  }

  /**
   * Gets successor entry
   */
  private getSuccessor(node: BTreeNode<K, V>, index: number): BTreeEntry<K, V> {
    let current = node.children[index + 1];
    while (!current.isLeaf) {
      current = current.children[0];
    }
    return current.entries[0];
  }

  /**
   * Fills a child node that has too few entries
   */
  private fillChild(parent: BTreeNode<K, V>, index: number): void {
    const minEntries = Math.ceil(this.order / 2) - 1;

    // Borrow from previous sibling
    if (index > 0 && parent.children[index - 1].entries.length > minEntries) {
      this.borrowFromPrev(parent, index);
    }
    // Borrow from next sibling
    else if (
      index < parent.children.length - 1 &&
      parent.children[index + 1].entries.length > minEntries
    ) {
      this.borrowFromNext(parent, index);
    }
    // Merge with sibling
    else {
      if (index < parent.children.length - 1) {
        this.mergeChildren(parent, index);
      } else {
        this.mergeChildren(parent, index - 1);
      }
    }
  }

  /**
   * Borrows an entry from previous sibling
   */
  private borrowFromPrev(parent: BTreeNode<K, V>, childIndex: number): void {
    const child = parent.children[childIndex];
    const sibling = parent.children[childIndex - 1];

    // Move parent entry to child
    child.entries.unshift(parent.entries[childIndex - 1]);

    // Move sibling's last entry to parent
    parent.entries[childIndex - 1] = sibling.entries.pop()!;

    // Move child pointer if not leaf
    if (!child.isLeaf) {
      child.children.unshift(sibling.children.pop()!);
      child.children[0].parent = child;
    }
  }

  /**
   * Borrows an entry from next sibling
   */
  private borrowFromNext(parent: BTreeNode<K, V>, childIndex: number): void {
    const child = parent.children[childIndex];
    const sibling = parent.children[childIndex + 1];

    // Move parent entry to child
    child.entries.push(parent.entries[childIndex]);

    // Move sibling's first entry to parent
    parent.entries[childIndex] = sibling.entries.shift()!;

    // Move child pointer if not leaf
    if (!child.isLeaf) {
      child.children.push(sibling.children.shift()!);
      child.children[child.children.length - 1].parent = child;
    }
  }

  /**
   * Merges a child with its sibling
   */
  private mergeChildren(parent: BTreeNode<K, V>, index: number): void {
    const leftChild = parent.children[index];
    const rightChild = parent.children[index + 1];

    // Move parent entry to left child
    leftChild.entries.push(parent.entries[index]);

    // Move all entries from right child to left child
    leftChild.entries.push(...rightChild.entries);

    // Move children if not leaf
    if (!leftChild.isLeaf) {
      leftChild.children.push(...rightChild.children);
      rightChild.children.forEach((child) => (child.parent = leftChild));
    }

    // Remove entry from parent
    parent.entries.splice(index, 1);
    parent.children.splice(index + 1, 1);
  }

  /**
   * Returns all entries in sorted order
   */
  public toArray(): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    this.traverse(this.root, result);
    return result;
  }

  /**
   * Traverses the tree in order
   */
  private traverse(node: BTreeNode<K, V>, result: Array<{ key: K; value: V }>): void {
    let i = 0;
    for (i = 0; i < node.entries.length; i++) {
      if (!node.isLeaf) {
        this.traverse(node.children[i], result);
      }
      result.push(node.entries[i]);
    }
    if (!node.isLeaf) {
      this.traverse(node.children[i], result);
    }
  }

  /**
   * Finds all entries within a range
   * @param min - Minimum key (inclusive)
   * @param max - Maximum key (inclusive)
   */
  public range(min: K, max: K): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    this.rangeSearch(this.root, min, max, result);
    return result;
  }

  /**
   * Range search within a node
   */
  private rangeSearch(
    node: BTreeNode<K, V>,
    min: K,
    max: K,
    result: Array<{ key: K; value: V }>
  ): void {
    let i = 0;

    // Find starting point
    while (i < node.entries.length && this.comparator(min, node.entries[i].key) > 0) {
      i++;
    }

    // Traverse and collect matching entries
    while (i < node.entries.length) {
      if (!node.isLeaf) {
        this.rangeSearch(node.children[i], min, max, result);
      }

      if (this.comparator(node.entries[i].key, max) <= 0) {
        result.push(node.entries[i]);
      } else {
        break;
      }

      i++;
    }

    if (!node.isLeaf && i < node.children.length) {
      this.rangeSearch(node.children[i], min, max, result);
    }
  }

  /**
   * Clears all entries from the tree
   */
  public clear(): void {
    this.root = new BTreeNode<K, V>(true);
    this.size = 0;
  }
}

