import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type ItemCount = {
  itemHrid: string
  count: number
}

type Action = {
  hrid: string
  function: string
  type: string
  category: string
  name: string
  baseTimeCost: number
  levelRequirement: { skillHrid: string; level: number } | null
  inputItems: ItemCount[] | null
  outputItems: ItemCount[] | null
  upgradeItemHrid: string
  sortIndex: number
}

type Item = {
  hrid: string
  name: string
}

type GameData = {
  itemDetailMap: Record<string, Item>
  actionDetailMap: Record<string, Action>
}

type CraftNode = {
  itemHrid: string
  itemName: string
  quantityRequested: number
  quantityProducedPerCraft: number
  craftsNeeded: number
  isBaseMaterial: boolean
  action?: Action
  children: CraftNode[]
  totalTimeSeconds: number
}

function loadGameData(): GameData {
  const preferredPath = resolve(process.cwd(), 'data', 'init_client_data.json')
  const fallbackPath = resolve(process.cwd(), 'vendor', 'mwi-types', 'src', 'sources', 'game_data.json')

  let gameDataPath: string
  if (existsSync(preferredPath)) {
    gameDataPath = preferredPath
  } else if (existsSync(fallbackPath)) {
    gameDataPath = fallbackPath
  } else {
    throw new Error(
      'No game data file found. Expected data/init_client_data.json or vendor/mwi-types/src/sources/game_data.json',
    )
  }

  const raw = readFileSync(gameDataPath, 'utf8')
  return JSON.parse(raw) as GameData
}

function buildActionLookup(actions: Record<string, Action>): Map<string, Action[]> {
  const map = new Map<string, Action[]>()

  for (const action of Object.values(actions)) {
    if (action.function !== '/action_functions/production') {
      continue
    }

    if (!action.outputItems || action.outputItems.length === 0) {
      continue
    }

    for (const output of action.outputItems) {
      const list = map.get(output.itemHrid) ?? []
      list.push(action)
      map.set(output.itemHrid, list)
    }
  }

  for (const [key, list] of map.entries()) {
    list.sort((a, b) => a.sortIndex - b.sortIndex)
    map.set(key, list)
  }

  return map
}

function getArgValue(args: string[], flag: string): string | undefined {
  const flagPrefix = `${flag}=`
  let startIndex = -1
  let initialValue: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === flag) {
      startIndex = i + 1
      break
    }

    if (arg.startsWith(flagPrefix)) {
      startIndex = i
      initialValue = arg.slice(flagPrefix.length)
      break
    }
  }

  if (startIndex < 0) {
    return undefined
  }

  const tokens: string[] = []
  if (typeof initialValue === 'string' && initialValue.length > 0) {
    tokens.push(initialValue)
  }

  const scanStart = initialValue === undefined ? startIndex : startIndex + 1
  for (let i = scanStart; i < args.length; i++) {
    const token = args[i]
    if (token.startsWith('--')) {
      break
    }

    tokens.push(token)
  }

  const value = tokens.join(' ').trim()
  return value.length > 0 ? value : undefined
}

function parseInventoryArg(args: string[]): Map<string, number> {
  const path = getArgValue(args, '--inventory')
  if (!path) {
    return new Map()
  }

  const inventoryPath = resolve(process.cwd(), path)
  const raw = readFileSync(inventoryPath, 'utf8')
  const parsed = JSON.parse(raw) as Record<string, number>

  return new Map(
    Object.entries(parsed)
      .map(([item, count]) => [item, Number(count)] as const)
      .filter(([, count]) => Number.isFinite(count) && count > 0),
  )
}

function formatItem(itemMap: Map<string, Item>, itemHrid: string): string {
  return itemMap.get(itemHrid)?.name ?? itemHrid
}

function chooseRecipeForOutput(candidates: Action[]): Action {
  return candidates[0]
}

function buildCraftTree(
  itemHrid: string,
  quantity: number,
  actionByOutput: Map<string, Action[]>,
  itemMap: Map<string, Item>,
  path: Set<string>,
): CraftNode {
  if (path.has(itemHrid)) {
    throw new Error(`Detected circular dependency while expanding ${itemHrid}`)
  }

  const candidates = actionByOutput.get(itemHrid) ?? []
  if (candidates.length === 0) {
    return {
      itemHrid,
      itemName: formatItem(itemMap, itemHrid),
      quantityRequested: quantity,
      quantityProducedPerCraft: 0,
      craftsNeeded: 0,
      isBaseMaterial: true,
      children: [],
      totalTimeSeconds: 0,
    }
  }

  const action = chooseRecipeForOutput(candidates)
  const outputCount = action.outputItems?.find((x) => x.itemHrid === itemHrid)?.count ?? 1
  const craftsNeeded = Math.ceil(quantity / outputCount)

  const nextPath = new Set(path)
  nextPath.add(itemHrid)

  const children: CraftNode[] = []

  if (action.upgradeItemHrid && action.upgradeItemHrid !== '') {
    children.push(buildCraftTree(action.upgradeItemHrid, craftsNeeded, actionByOutput, itemMap, nextPath))
  }

  for (const input of action.inputItems ?? []) {
    children.push(
      buildCraftTree(
        input.itemHrid,
        input.count * craftsNeeded,
        actionByOutput,
        itemMap,
        nextPath,
      ),
    )
  }

  const childTime = children.reduce((sum, node) => sum + node.totalTimeSeconds, 0)
  const ownTime = (action.baseTimeCost / 1_000_000_000) * craftsNeeded

  return {
    itemHrid,
    itemName: formatItem(itemMap, itemHrid),
    quantityRequested: quantity,
    quantityProducedPerCraft: outputCount,
    craftsNeeded,
    isBaseMaterial: false,
    action,
    children,
    totalTimeSeconds: ownTime + childTime,
  }
}

function collectBaseMaterials(node: CraftNode, totals = new Map<string, number>()): Map<string, number> {
  if (node.isBaseMaterial) {
    const current = totals.get(node.itemHrid) ?? 0
    totals.set(node.itemHrid, current + node.quantityRequested)
    return totals
  }

  for (const child of node.children) {
    collectBaseMaterials(child, totals)
  }

  return totals
}

function collectSkillRequirements(node: CraftNode, totals = new Map<string, number>()): Map<string, number> {
  if (node.action?.levelRequirement?.skillHrid) {
    const skill = node.action.levelRequirement.skillHrid
    const level = node.action.levelRequirement.level
    const current = totals.get(skill) ?? 0
    totals.set(skill, Math.max(current, level))
  }

  for (const child of node.children) {
    collectSkillRequirements(child, totals)
  }

  return totals
}

function printTree(node: CraftNode, prefix = '', isLast = true, isRoot = false): void {
  const branch = isRoot ? '' : isLast ? '└─ ' : '├─ '
  const recipePart = node.action
    ? ` | via ${node.action.name} (${node.action.hrid}) x${node.craftsNeeded}`
    : ' | base material'

  console.log(`${prefix}${branch}${node.itemName} ${node.quantityRequested} (${node.itemHrid})${recipePart}`)

  const nextPrefix = isRoot ? '' : `${prefix}${isLast ? '   ' : '│  '}`

  node.children.forEach((child, index) => {
    printTree(child, nextPrefix, index === node.children.length - 1)
  })
}

function toDuration(seconds: number): string {
  const whole = Math.round(seconds)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function findItemByName(itemMap: Map<string, Item>, query: string): string | undefined {
  const normalized = query.trim().toLowerCase()
  const exact = Array.from(itemMap.values()).find((item) => item.name.toLowerCase() === normalized)
  if (exact) {
    return exact.hrid
  }

  const partial = Array.from(itemMap.values()).find((item) => item.name.toLowerCase().includes(normalized))
  return partial?.hrid
}

function findSuggestedItemNames(itemMap: Map<string, Item>, query: string, max = 8): Item[] {
  const normalized = query.trim().toLowerCase()
  const terms = normalized.split(/\s+/).filter(Boolean)

  const ranked = Array.from(itemMap.values()).map((item) => {
    const name = item.name.toLowerCase()
    let score = 0

    if (name.includes(normalized)) {
      score += 100
    }

    for (const term of terms) {
      if (name.includes(term)) {
        score += 10
      }
    }

    return { item, score }
  })

  return ranked
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, max)
    .map((entry) => entry.item)
}

function findItemFromActionName(actions: Record<string, Action>, query: string): string | undefined {
  const normalized = query.trim().toLowerCase()
  const candidates = Object.values(actions).filter((action) => action.name.toLowerCase() === normalized)
  if (candidates.length === 0) {
    return undefined
  }

  const production = candidates.find((action) => action.function === '/action_functions/production')
  const chosen = production ?? candidates[0]
  return chosen?.outputItems?.[0]?.itemHrid
}

function main(): void {
  const args = process.argv.slice(2)

  const requestedItem = getArgValue(args, '--item')
  const requestedName = getArgValue(args, '--name')
  const quantityRaw = getArgValue(args, '--quantity') ?? '1'
  const quantity = Number(quantityRaw)

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('--quantity must be a positive number')
  }

  const data = loadGameData()
  const itemMap = new Map(Object.entries(data.itemDetailMap).map(([hrid, item]) => [hrid, item]))
  const actionByOutput = buildActionLookup(data.actionDetailMap)

  const itemHrid = requestedItem
    ?? (requestedName ? findItemByName(itemMap, requestedName) : undefined)
    ?? (requestedName ? findItemFromActionName(data.actionDetailMap, requestedName) : undefined)

  if (!itemHrid) {
    const suggestions = requestedName ? findSuggestedItemNames(itemMap, requestedName) : []

    console.log('Usage: npm run calc -- --item=/items/your_item --quantity=1')
    console.log('   or: npm run calc -- --name="Item Name" --quantity=1')
    console.log('Optional inventory file: --inventory=inventory.json')

    if (requestedName) {
      console.log('')
      console.log(`No item or action matched name: "${requestedName}"`)
      if (suggestions.length > 0) {
        console.log('Closest item names:')
        for (const suggestion of suggestions) {
          console.log(`- ${suggestion.name} (${suggestion.hrid})`)
        }
      }
    }

    process.exit(1)
  }

  if (!itemMap.has(itemHrid)) {
    throw new Error(`Unknown item HRID: ${itemHrid}`)
  }

  const inventory = parseInventoryArg(args)

  const tree = buildCraftTree(itemHrid, quantity, actionByOutput, itemMap, new Set())
  const base = collectBaseMaterials(tree)
  const skills = collectSkillRequirements(tree)

  console.log('')
  console.log(`Crafting chain for ${formatItem(itemMap, itemHrid)} x${quantity}`)
  console.log('')
  printTree(tree, '', true, true)

  console.log('')
  console.log('Base materials needed:')
  for (const [materialHrid, count] of Array.from(base.entries()).sort((a, b) => b[1] - a[1])) {
    const available = inventory.get(materialHrid) ?? 0
    const missing = Math.max(0, count - available)
    const availability = available > 0 ? ` | have ${available}, missing ${missing}` : ''
    console.log(`- ${formatItem(itemMap, materialHrid)} (${materialHrid}): ${count}${availability}`)
  }

  console.log('')
  console.log('Skill requirements (minimum levels):')
  for (const [skill, level] of Array.from(skills.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`- ${skill}: ${level}`)
  }

  console.log('')
  console.log(`Estimated total base crafting time: ${toDuration(tree.totalTimeSeconds)} (${Math.round(tree.totalTimeSeconds)}s)`)
  console.log('')
  console.log('Note: when multiple recipes produce the same item, this tool currently picks the first recipe by sort index.')
}

main()
