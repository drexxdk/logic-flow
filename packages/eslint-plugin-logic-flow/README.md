# eslint-plugin-logic-flow

ESLint rules for projects using `logic-flow`.

## Rules

- `logic-flow/terminal-goto`: reports meaningful statements after `goto(...)` in the same block.

## Usage

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import logicFlowPlugin from 'eslint-plugin-logic-flow';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  logicFlowPlugin.configs.recommended,
);
```
