#!/usr/bin/env npx tsx
/**
 * Publish local env files to 1Password.
 *
 * Reads .env.local and .env.cli, then creates or upserts a 1Password item
 * named `dev:{{REPO_NAME}}`. Fields are stored with prefixes:
 *   .env.local keys  →  local.KEY
 *   .env.cli keys    →  cli.KEY
 *
 * This matches the routing convention used by refresh-1password-secrets.ts.
 *
 * Usage:
 *   npx tsx scripts/publish-1password-secrets.ts
 *   npx tsx scripts/publish-1password-secrets.ts --dry-run
 *   npx tsx scripts/publish-1password-secrets.ts --item dev:my-app
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Keys that are internal to the shell/OS and should never be published.
const RESERVED_KEYS = new Set(['PWD', 'SHLVL', '_', 'HOME', 'USER', 'SHELL', 'TERM', 'PATH'])

interface Args {
  item: string
  dryRun: boolean
  prune: boolean
  output?: string
}

interface Summary {
  generatedAt: string
  item: string
  dryRun: boolean
  created: boolean
  upserted: string[]
  skipped: string[]
}

interface OpField {
  label?: string
  type?: string
  value?: string
  [key: string]: unknown
}

interface OpItemTemplate {
  title?: string
  category?: string
  fields?: OpField[]
  [key: string]: unknown
}

function parseArgs(argv: string[]): Args {
  let item = 'dev:{{REPO_NAME}}'
  let dryRun = false
  let prune = false
  let output: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--item') { item = argv[++i] }
    else if (arg.startsWith('--item=')) { item = arg.slice('--item='.length) }
    else if (arg === '--dry-run') { dryRun = true }
    else if (arg === '--prune') { prune = true }
    else if (arg === '--output') { output = argv[++i] }
    else if (arg.startsWith('--output=')) { output = arg.slice('--output='.length) }
    else { throw new Error(`Unknown argument: ${arg}`) }
  }

  return { item, dryRun, prune, output }
}

async function resolveEnvPath(relativePath: string): Promise<string> {
  const p = resolve(process.cwd(), relativePath)
  try { return await realpath(p) } catch { return p }
}

async function parseEnvFile(path: string): Promise<Record<string, string>> {
  let content: string
  try { content = await readFile(path, 'utf8') } catch { return {} }

  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    if (RESERVED_KEYS.has(key)) continue
    let value = trimmed.slice(eq + 1)
    // Strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

async function readItem(item: string): Promise<OpItemTemplate | undefined> {
  try {
    const { stdout } = await execFileAsync('op', ['item', 'get', item, '--format', 'json'], {
      maxBuffer: 10 * 1024 * 1024,
    })
    return JSON.parse(stdout) as OpItemTemplate
  } catch {
    return undefined
  }
}

function buildField(label: string, value: string): OpField {
  return { label, type: 'STRING', value }
}

function isManagedField(field: OpField): boolean {
  return typeof field.label === 'string' && (field.label.startsWith('local.') || field.label.startsWith('cli.'))
}

function buildCreateTemplate(item: string, fields: Record<string, string>): OpItemTemplate {
  return {
    title: item,
    category: 'SECURE_NOTE',
    fields: Object.entries(fields).map(([label, value]) => buildField(label, value)),
  }
}

function mergeFieldsIntoTemplate(
  existing: OpItemTemplate,
  fields: Record<string, string>,
  prune: boolean,
): OpItemTemplate {
  const next = JSON.parse(JSON.stringify(existing)) as OpItemTemplate
  const targetLabels = new Set(Object.keys(fields))
  const existingFields = Array.isArray(next.fields) ? next.fields : []
  next.fields = prune
    ? existingFields.filter((field) => !isManagedField(field) || (field.label && targetLabels.has(field.label)))
    : existingFields

  const fieldsByLabel = new Map<string, OpField>()
  for (const field of next.fields) {
    if (typeof field.label === 'string') fieldsByLabel.set(field.label, field)
  }

  for (const [label, value] of Object.entries(fields)) {
    const field = fieldsByLabel.get(label)
    if (field) {
      field.value = value
      if (!field.type) field.type = 'STRING'
    } else {
      next.fields.push(buildField(label, value))
    }
  }

  return next
}

async function withTemplateFile(template: OpItemTemplate, fn: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'op-item-template-'))
  const path = join(dir, 'item.json')

  try {
    await writeFile(path, `${JSON.stringify(template, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await fn(path)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const appPath = await resolveEnvPath('.env.local')
  const cliPath = await resolveEnvPath('.env.cli')

  const appEnv = await parseEnvFile(appPath)
  const cliEnv = await parseEnvFile(cliPath)

  // Build prefixed field map
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(appEnv)) fields[`local.${k}`] = v
  for (const [k, v] of Object.entries(cliEnv)) fields[`cli.${k}`] = v

  const upserted = Object.keys(fields).sort()

  console.log(`Item: ${args.item}`)
  console.log(`Mode: ${args.dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Fields to publish: ${upserted.length}`)
  for (const key of upserted) console.log(`  ${key}`)

  const summary: Summary = {
    generatedAt: new Date().toISOString(),
    item: args.item,
    dryRun: args.dryRun,
    created: false,
    upserted,
    skipped: [],
  }

  if (!args.dryRun) {
    const existing = await readItem(args.item)

    if (!existing) {
      console.log(`\nCreating item: ${args.item}`)
      const template = buildCreateTemplate(args.item, fields)
      await withTemplateFile(template, async (path) => {
        await execFileAsync('op', ['item', 'create', '--template', path])
      })
      summary.created = true
    } else {
      console.log(`\nUpserting into existing item: ${args.item}`)
      if (upserted.length > 0 || args.prune) {
        const template = mergeFieldsIntoTemplate(existing, fields, args.prune)
        await withTemplateFile(template, async (path) => {
          await execFileAsync('op', ['item', 'edit', args.item, '--template', path])
        })
      }
    }

    console.log('Done.')
  }

  if (args.output) await writeJson(args.output, summary)
}

main().catch((error) => {
  console.error('Secret publish failed:', error)
  process.exit(1)
})
