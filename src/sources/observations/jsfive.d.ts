declare module "jsfive" {
  export class File {
    constructor(buffer: ArrayBuffer);
    get(name: string): { value: unknown };
  }
}
