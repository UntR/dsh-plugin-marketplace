import type { RegistryIndexEntry } from '../shared/schema.js'

export type CatalogSort = 'name' | 'updated' | 'pushed' | 'stars'
export type CatalogAvailability = 'all' | 'installable' | 'configuration' | 'unavailable'

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function filterCatalog(
  plugins: readonly RegistryIndexEntry[],
  query: string,
): RegistryIndexEntry[] {
  const tokens = normalized(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return [...plugins]
  return plugins.filter((plugin) => {
    const fields = [
      plugin.name,
      plugin.slug,
      plugin.owner.login,
      plugin.description,
      ...plugin.topics,
      plugin.install.packageName ?? '',
    ].map(normalized)
    return tokens.every(token => fields.some(field => field.includes(token)))
  })
}

export function sortCatalog(
  plugins: readonly RegistryIndexEntry[],
  sort: CatalogSort,
): RegistryIndexEntry[] {
  return [...plugins].sort((left, right) => {
    if (sort === 'stars') return right.stats.stars - left.stats.stars || left.slug.localeCompare(right.slug)
    if (sort === 'updated') {
      return right.timestamps.updatedAt.localeCompare(left.timestamps.updatedAt) || left.slug.localeCompare(right.slug)
    }
    if (sort === 'pushed') {
      return (right.timestamps.pushedAt ?? '').localeCompare(left.timestamps.pushedAt ?? '')
        || left.slug.localeCompare(right.slug)
    }
    return left.slug.toLocaleLowerCase().localeCompare(right.slug.toLocaleLowerCase())
  })
}

export function filterCatalogAvailability(
  plugins: readonly RegistryIndexEntry[],
  availability: CatalogAvailability,
): RegistryIndexEntry[] {
  if (availability === 'all') return [...plugins]
  if (availability === 'installable') {
    return plugins.filter(plugin => plugin.install.available && !plugin.install.requiresBuildApproval)
  }
  if (availability === 'configuration') {
    return plugins.filter(plugin => plugin.install.available && plugin.install.requiresBuildApproval)
  }
  return plugins.filter(plugin => !plugin.install.available)
}

export function catalogLanguageCounts(
  plugins: readonly RegistryIndexEntry[],
): ReadonlyArray<readonly [language: string, count: number]> {
  const counts = new Map<string, number>()
  for (const plugin of plugins) {
    if (plugin.language !== null) counts.set(plugin.language, (counts.get(plugin.language) ?? 0) + 1)
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 6)
}
