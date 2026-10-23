# LLM prompt registration (cyber-breach)

Before an **official run series**, each general-purpose LLM uses a frozen prompt in this folder.

## Tuning period

1. Run `bench cyber extract-test` and manual spot checks on recent incidents.
2. Adjust `system` and `userTemplate` in each `*.json` file.
3. Record model ID and prompt hash in the run report.
4. **Registration deadline:** commit prompts to this repo before the series start date.

## Outside submissions

Fork the repo and open a PR with your proposed prompt before the deadline. Maintainers merge or reject before prompts are frozen.

## Files

- `registry.json` — frozen SHA-256 hashes and default models (official series)
- `openai.json` — ChatGPT / OpenAI Responses + web search
- `anthropic.json` — Claude + web search
- `gemini.json` — Gemini + Google Search grounding
