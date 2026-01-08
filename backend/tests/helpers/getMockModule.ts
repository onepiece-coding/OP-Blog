export async function getMockModule(moduleName: string): Promise<any> {
  const mod = await import(moduleName);
  return (mod && (mod as any).default) ? (mod as any).default : mod;
}
export default getMockModule;