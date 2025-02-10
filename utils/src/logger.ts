export class Logger {
    private static supportsColor(): boolean {
      // Check if we're in a Node.js environment and if it supports colors
      return process.stdout.isTTY && process.env.FORCE_COLOR !== '0';
    }
  
    private static getPrefix(level: string, color: string): string {
      return Logger.supportsColor() 
        ? `\x1b[${color}m[${level}]\x1b[0m`
        : `[${level}]`;
    }
  
    static success(...args: any[]): void {
      console.log(Logger.getPrefix('SUCCESS', '32'), ...args);
    }
  
    static info(...args: any[]): void {
      console.log(Logger.getPrefix('INFO', '32'), ...args);
    }
  
    static warn(...args: any[]): void {
      console.warn(Logger.getPrefix('WARN', '33'), ...args);
    }
  
    static error(...args: any[]): void {
      console.error(Logger.getPrefix('ERROR', '31'), ...args);
    }
  
    static debug(...args: any[]): void {
      console.debug(Logger.getPrefix('DEBUG', '34'), ...args);
    }
  
    static log(...args: any[]): void {
      console.log(...args);
    }
  } 
  