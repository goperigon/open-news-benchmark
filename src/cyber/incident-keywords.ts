const INCIDENT_RE =
  /\b(breach|breached|ransomware|hacked|hackers|cyberattack|cyber attack|data leak|data breach|unauthorized access|extortion|stolen data|compromised)\b/i

export function titleLooksLikeIncident(title: string): boolean {
  return INCIDENT_RE.test(title)
}

export function guessOrgKeyFromTitle(title: string): string | null {
  const patterns = [
    /^([A-Z][A-Za-z0-9&.'-]{2,40})\s+(breach|ransomware|hack|cyberattack)/i,
    /(?:at|hits|targeting|against)\s+([A-Z][A-Za-z0-9&.'-]{2,40})/i,
  ]
  for (const re of patterns) {
    const m = title.match(re)
    if (m?.[1]) {
      const key = m[1].toLowerCase().replace(/[^a-z0-9]+/g, '')
      if (key.length >= 3) {
        return key
      }
    }
  }
  return null
}
