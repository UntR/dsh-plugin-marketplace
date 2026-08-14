import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import {
  registryIndexSchema,
  registryMetaSchema,
  registryPluginDetailSchema,
} from '../src/schema.js'
import { stableStringify } from '../src/stable-json.js'

const outputDir = resolve(import.meta.dirname, '../schemas')
await mkdir(outputDir, { recursive: true })

const schemas = [
  ['meta-v1.schema.json', registryMetaSchema],
  ['index-v1.schema.json', registryIndexSchema],
  ['plugin-v1.schema.json', registryPluginDetailSchema],
] as const

for (const [filename, schema] of schemas) {
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-2020-12' })
  await writeFile(resolve(outputDir, filename), stableStringify(jsonSchema), 'utf8')
}
