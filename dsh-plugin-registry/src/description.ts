function truncateCodePoints(value: string, maximum: number): string {
  const codePoints = Array.from(value)
  return codePoints.length <= maximum ? value : codePoints.slice(0, maximum).join('')
}

function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function shouldSkip(line: string): boolean {
  const trimmed = line.trim()
  return trimmed === ''
    || /^#{1,6}\s/.test(trimmed)
    || /^[-*+]\s/.test(trimmed)
    || /^\d+[.)]\s/.test(trimmed)
    || /^>/.test(trimmed)
    || /^!\[/.test(trimmed)
    || /^<[^>]+>.*<\/[^>]+>$/.test(trimmed)
    || trimmed.includes('|')
    || /shields\.io|badge|coverage|license|build status/i.test(trimmed)
}

export function extractReadmeDescription(readme: string): string {
  const lines = readme.replaceAll('\r\n', '\n').split('\n')
  let inCodeFence = false
  let paragraph: string[] = []
  for (const line of lines) {
    if (/^\s*```/.test(line) || /^\s*~~~/.test(line)) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence) continue
    if (line.trim() === '') {
      if (paragraph.length > 0) break
      continue
    }
    if (shouldSkip(line)) {
      if (paragraph.length > 0) break
      continue
    }
    const text = plainText(line)
    if (text !== '') paragraph.push(text)
  }
  return truncateCodePoints(paragraph.join(' ').replace(/\s+/g, ' ').trim(), 280)
}

export function selectDescription(repositoryDescription: string | null, readme: string | null): string {
  const repositoryText = repositoryDescription?.replace(/\s+/g, ' ').trim() ?? ''
  if (repositoryText !== '') return truncateCodePoints(repositoryText, 280)
  return readme === null ? '' : extractReadmeDescription(readme)
}

