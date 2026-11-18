// DSH bundle for ponytail: registers the six ponytail skills with the host
// skill registry, and seeds $DSH_HOME/AGENTS.md only when the user has none.
import { copyFile, access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

// BUNDLED_SKILL_RANK in @deepseek-ai/dsh-skill: a user's own copy wins.
const RANK = 600
const PROVIDER = 'ponytail'
const INVOCATION = { modelInvocable: true, userInvocable: true }
const SKILLS = [
  'ponytail', 'ponytail-audit', 'ponytail-debt',
  'ponytail-gain', 'ponytail-help', 'ponytail-review',
]
const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)))

function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text)
  if (match === null) throw new Error('ponytail: SKILL.md has no frontmatter')
  const meta = {}
  let key = null
  for (const line of match[1].split('\n')) {
    const entry = /^([A-Za-z-]+):[ \t]*(.*)$/u.exec(line)
    if (entry !== null) {
      key = entry[1]
      meta[key] = entry[2] === '>' || entry[2] === '|' ? '' : entry[2]
      continue
    }
    // Continuation line of a folded or literal block scalar.
    if (key !== null && /^[ \t]+\S/u.test(line)) meta[key] += `${meta[key] === '' ? '' : ' '}${line.trim()}`
  }
  return { meta, content: text.slice(match[0].length).trim() }
}

async function readSkill(skill) {
  const dir = join(pkgRoot, 'skills', skill)
  const { meta, content } = parseFrontmatter(await readFile(join(dir, 'SKILL.md'), 'utf8'))
  return { dir, description: meta.description ?? '', content }
}

const provider = {
  name: PROVIDER,
  async list() {
    return Promise.all(SKILLS.map(async (skill) => {
      const { dir, description } = await readSkill(skill)
      return {
        name: skill,
        description,
        invocation: INVOCATION,
        provider: PROVIDER,
        source: 'bundled',
        resourceBase: { kind: 'directory', path: dir },
        rank: RANK,
        locator: join(dir, 'SKILL.md'),
      }
    }))
  },
  // DSH passes the SkillCandidate listed above, not the bare name.
  async get(candidate) {
    const name = candidate.name
    if (!SKILLS.includes(name)) return undefined
    const { dir, description, content } = await readSkill(name)
    return {
      name,
      description,
      invocation: INVOCATION,
      provider: PROVIDER,
      source: 'bundled',
      resourceBase: { kind: 'directory', path: dir },
      content,
    }
  },
}

async function seedAgentsFile() {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  const target = join(dshHome, 'AGENTS.md')
  const exists = await access(target, constants.F_OK).then(() => true, () => false)
  if (!exists) await copyFile(join(pkgRoot, 'AGENTS.md'), target)
}

export const name = 'ponytail'
export const inject = ['skills']

export function apply(ctx) {
  ctx.skills.registerProvider(() => provider)
  // Always-on rules, not only on-demand skills. Existing user rules are kept.
  seedAgentsFile().catch((error) => {
    console.warn('[ponytail] AGENTS.md seed failed:', error && error.message)
  })
}
