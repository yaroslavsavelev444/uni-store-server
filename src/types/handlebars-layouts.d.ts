// types/handlebars-layouts.d.ts
declare module "handlebars-layouts" {
  import type Handlebars from "handlebars";

  interface LayoutHelpers {
    [helperName: string]: (...args: any[]) => any;
  }

  function layouts(hbs: typeof Handlebars): LayoutHelpers;
  function register(hbs: typeof Handlebars): LayoutHelpers;

  export = layouts;
  export type { register };
}
