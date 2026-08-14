import type { z } from 'zod'
import type {
  registryIndexEntrySchema,
  registryIndexSchema,
  registryMetaSchema,
  registryPluginDetailSchema,
} from './schema.js'

export type RegistryMeta = z.infer<typeof registryMetaSchema>
export type RegistryIndex = z.infer<typeof registryIndexSchema>
export type RegistryIndexEntry = z.infer<typeof registryIndexEntrySchema>
export type RegistryPluginDetail = z.infer<typeof registryPluginDetailSchema>
