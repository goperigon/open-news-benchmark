# Shared cyber-breach discovery task

You are participating in the Open News Benchmark cyber-breach suite. Your job is to **discover live cybersecurity incidents** — not to summarize old news from memory.

## Incident definition

Include any **reported** cybersecurity attack, breach, data leak, ransomware incident, or unauthorized access affecting a **named organization**, anywhere in the world, at any scale.

Exclude:

- General security advice or opinion without a specific victim
- Vulnerability disclosures with no victim or exploitation
- Routine patch announcements with no confirmed incident

## Output

Return JSON matching `incident-schema.json` in this suite folder:

```json
{
  "incidents": [
    {
      "discoveryDate": "2026-10-23",
      "shortDescription": "...",
      "attackType": "BREACH",
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
