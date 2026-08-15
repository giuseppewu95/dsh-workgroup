/**
 * Minimal in-memory storage backend for tests: implements the
 * `@deepseek-ai/dsh-storage` backend contract (kv facet with
 * open/loadAll/putRecord/deleteRecord/setGlobal/close) over plain maps.
 *
 * @module dsh-workgroup/tests/memory-backend
 */

import type { StorageBackend, KvUnitDescriptor } from '@deepseek-ai/dsh-storage'

interface TableState {
  records: Map<string, unknown>
}

interface UnitState {
  global: unknown
  tables: Map<string, TableState>
}

/** One opened unit's handle over the shared media. */
class MemoryUnit {
  constructor(private readonly state: UnitState) {}

  async loadAll(): Promise<{ global: unknown; tables: Record<string, Record<string, unknown>> }> {
    const tables: Record<string, Record<string, unknown>> = {}
    for (const [name, table] of this.state.tables) {
      tables[name] = Object.fromEntries(table.records)
    }
    return { global: this.state.global, tables }
  }

  async putRecord(table: string, key: string, value: unknown): Promise<void> {
    const tableState = this.state.tables.get(table)
    if (tableState === undefined) throw new Error(`unknown table ${table}`)
    tableState.records.set(key, value)
  }

  async deleteRecord(table: string, key: string): Promise<void> {
    this.state.tables.get(table)?.records.delete(key)
  }

  async setGlobal(value: unknown): Promise<void> {
    this.state.global = value
  }

  async close(): Promise<void> {}
}

/** In-memory storage backend with an optional shared media pool. */
export class MemoryStorageBackend implements StorageBackend {
  /** Shared media across backend instances (defaults to a fresh pool). */
  readonly pool: Map<string, UnitState>

  constructor(pool: Map<string, UnitState> = new Map()) {
    this.pool = pool
  }

  kv = {
    open: async (descriptor: KvUnitDescriptor) => {
      let state = this.pool.get(descriptor.name)
      if (state === undefined) {
        const tables = new Map<string, TableState>()
        for (const name of descriptor.tables) tables.set(name, { records: new Map() })
        state = { global: null, tables }
        this.pool.set(descriptor.name, state)
      }
      return new MemoryUnit(state)
    },
  }

  async close(): Promise<void> {}
}
