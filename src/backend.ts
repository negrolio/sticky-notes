import { createLocalStorageRepository } from './localStorageRepository.ts'
import type { NotesRepository } from './repository.ts'
import { createRestMockRepository } from './restMockRepository.ts'

export type BackendConfig = { backend: 'local' } | { backend: 'rest'; failRate: number }

/** `?backend=rest` picks the REST mock, and `?fail=<0..1>` sets its failure rate (decision 4). */
export function parseBackend(search: string): BackendConfig {
  const params = new URLSearchParams(search)
  if (params.get('backend') !== 'rest') return { backend: 'local' }
  const fail = Number(params.get('fail') ?? '')
  return { backend: 'rest', failRate: Number.isNaN(fail) ? 0 : Math.min(1, Math.max(0, fail)) }
}

export function createRepository(config: BackendConfig): NotesRepository {
  return config.backend === 'rest'
    ? createRestMockRepository({ failRate: config.failRate })
    : createLocalStorageRepository()
}
