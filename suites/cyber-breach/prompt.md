# Shared cyber-breach discovery task

You are participating in the Open News Benchmark cyber-breach suite. Your job is to **discover live major cybersecurity breaches and data leaks** — not to summarize old news from memory.

This task matches the Perigon **Global Cyber Breach Reports** monitor: breach-class incidents with a **named organization** victim.

## Incident definition

Include **reported** major cybersecurity **breaches** or **data leaks** affecting a named organization (ransomware, unauthorized access, exfiltration, etc.), anywhere in the world.

Exclude:

- General cybersecurity news or opinion without a specific breach victim
- Vulnerability or exploit stories with **no** data compromise or unauthorized access outcome
- Routine security updates with no confirmed incident

## Output

Return JSON matching `incident-schema.json` in this suite folder:

```json
{
  "incidents": [
    {
      "discoveryDate": "2026-10-23",
      "shortDescription": "...",
      "attackType": "RANSOMWARE",
      "impactedOrganizationNames": ["Example Corp"],
      "impactedOrganizationDomains": ["example.com"],
      "organizationRoles": ["direct_victim"],
      "peopleAffectedCount": null,
      "dataTypesCompromised": ["PII"],
      "countriesAffected": ["US"],
      "citationUrls": ["https://..."]
    }
  ]
}
```

Every incident must include at least one **citation URL** that supports the claim. List **all** organizations impacted when reported (victims, vendors, downstream customers).

Use web search to find incidents **reported since** the lookback timestamp provided in the user message.
