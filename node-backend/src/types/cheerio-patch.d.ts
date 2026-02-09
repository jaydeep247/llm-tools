import e from "express";

// Type patch for Cheerio Element compatibility
declare module "cheerio" {
  export type Element = any;
  export type CheerioAPI = any;

    export function load(content: string) {
        throw new Error('Function not implemented.');
    }
}