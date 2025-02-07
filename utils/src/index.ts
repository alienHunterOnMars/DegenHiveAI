export class Logger {

  static success(...args: any[]): void {
    // \x1b[32m: green; \x1b[0m: reset
    console.log("\x1b[32m[SUCCESS]\x1b[0m", ...args);
  }

  static info(...args: any[]): void {
    // \x1b[32m: green; \x1b[0m: reset
    console.log("\x1b[32m[INFO]\x1b[0m", ...args);
  }

  static warn(...args: any[]): void {
    // \x1b[33m: yellow; \x1b[0m: reset
    console.warn("\x1b[33m[WARN]\x1b[0m", ...args);
  }

  static error(...args: any[]): void {
    // \x1b[31m: red; \x1b[0m: reset
    console.error("\x1b[31m[ERROR]\x1b[0m", ...args);
  }

  static debug(...args: any[]): void {
    // \x1b[34m: blue; \x1b[0m: reset
    console.debug("\x1b[34m[DEBUG]\x1b[0m", ...args);
  }

  static log(...args: any[]): void {
    console.log(...args);
  }
} 
