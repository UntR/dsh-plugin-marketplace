import { resolve } from 'node:path'
import { publishRegistry } from './publish.js'
const root = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
if (args.length !== 0 && args.length !== 3) throw new Error('Usage: publish-cli.ts [FACTS AI OUTPUT]')
const facts = args[0] ? resolve(args[0]) : resolve(root, 'dsh-plugin-registry/registry/v1')
const ai = args[1] ? resolve(args[1]) : resolve(root, 'ai-data/v1')
const output = args[2] ? resolve(args[2]) : resolve(root, 'publish/registry/v1')
if (output === facts || output.startsWith(`${facts}/`) || output === ai || output.startsWith(`${ai}/`)) {
  throw new Error('Publish output must be separate from facts and AI data')
}
console.log(JSON.stringify(await publishRegistry({ facts, ai, output })))
