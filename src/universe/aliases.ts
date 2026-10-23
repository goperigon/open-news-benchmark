const SUFFIXES = [
  ', Inc.',
  ' Inc.',
  ', Inc',
  ' Inc',
  ' Corporation',
  ' Corp.',
  ' Corp',
  ' Co.',
  ' Co',
  ' PLC',
  ' plc',
  ' Ltd.',
  ' Ltd',
  ' LP',
  ' L.P.',
]

export function aliasesForCompanyName(name: string): string[] {
  let short = name.trim()
  for (const suffix of SUFFIXES) {
    if (short.endsWith(suffix)) {
      short = short.slice(0, -suffix.length).trim()
      break
    }
  }
  const aliases = new Set<string>()
  if (short.length > 0 && short !== name) {
    aliases.add(short)
  }
  return [...aliases]
}
