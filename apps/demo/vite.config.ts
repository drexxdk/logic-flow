import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', '');
  const repoName = env.GITHUB_REPOSITORY?.split('/')[1] ?? 'logic-flow';

  return {
    base: command === 'build' ? `/${repoName}/` : '/',
    plugins: [react()],
  };
});
