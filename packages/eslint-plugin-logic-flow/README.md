# eslint-plugin-logic-flow

ESLint rules for projects using `logic-flow`.

## Rules

- `logic-flow/terminal-goto`: reports meaningful statements after terminal flow operations such as `goto(...)` and `await dispatch(...)` inside supported `logic-flow` callbacks.

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
