// @ts-check
import { defineConfig } from 'astro/config';
// https://astro.build/config
export default defineConfig({
  build: {
    assets: 'static',
    inlineStylesheets: "always"
  },
  site: import.meta.env.DEV
    ? 'http://localhost:4321/'
    : 'https://20essentials.github.io/vybesound/',
  base: import.meta.env.DEV ? undefined : '/vybesound/'
});
