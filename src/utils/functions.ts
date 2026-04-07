export const $ = <T extends Element = HTMLElement>(el: string): T =>
  document.querySelector<T>(el) as T;
export const $$ = <T extends Element = HTMLElement>(el: string): T[] => [
  ...document.querySelectorAll<T>(el)
];

export function baseUrl(path: string) {
  return new URL(path.replace(/^\/+/, ''), import.meta.env.SITE).toString();
}

export const toKebabCase = (input = '') => {
  return input
    .normalize('NFD') // separa acentos
    .replace(/[\u0300-\u036f]/g, '') // elimina acentos
    .replace(/([a-z])([A-Z])/g, '$1-$2') // camelCase → camel-Case
    .replace(/[_\s]+/g, '-') // espacios y underscores → -
    .replace(/[^a-zA-Z0-9-]/g, '') // elimina caracteres especiales
    .replace(/--+/g, '-') // evita dobles guiones
    .toLowerCase()
    .trim();
};