# Local Rewrite Tool

A small local web app for rewriting pasted text with configurable AI providers.

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a `.env` file in this folder:

   ```sh
   cp .env.example .env
   ```

3. Open `.env` and add the API key for any provider you want to use.

You can also edit provider keys from the app's `config` panel. Provider edits are saved in `providers.json`, which is local to this folder and ignored by git.

## Run

```sh
npm start
```

Then open:

```txt
http://127.0.0.1:3000
```

## Use

- Paste text into the input field.
- Choose one of the five preset rewrite instructions.
- Click `config` to edit each preset name and prompt text.
- Choose a provider in the provider list. Cerebras options are included for `gpt-oss-120b` and `zai-glm-4.7`.
- Click `edit` next to a provider to update its name, model name, or API key.
- Click `run`.
- Copy the rewritten result from the output field.

The app does not save rewrite history. API keys are saved locally on the server and are not sent back to the browser.
