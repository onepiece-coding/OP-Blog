/**
 * Safely import a module that may be CommonJS (CJS) or ESM.
 * Returns the module's exports object (module.default if present).
 *
 * Usage:
 *   const nodemailer = await getMockModule('nodemailer');
 */
export async function getMockModule(moduleName: string): Promise<any> {
  const mod = await import(moduleName);
  // If the CJS mock was exported via module.exports, import() returns { default: <exports> }
  // So return mod.default when present, else return mod itself.
  return (mod && (mod as any).default) ? (mod as any).default : mod;
}
export default getMockModule;