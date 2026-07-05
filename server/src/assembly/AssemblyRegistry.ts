import type { ProjectAssembly, AssemblyManifest } from "./AssemblyTypes";

/**
 * AssemblyRegistry — in-memory store for completed assemblies.
 */
export class AssemblyRegistry {
  private assemblies = new Map<string, ProjectAssembly>();
  private manifests = new Map<string, AssemblyManifest>();

  store(assembly: ProjectAssembly): void {
    this.assemblies.set(assembly.id, assembly);
    if (assembly.manifest) {
      this.manifests.set(assembly.id, assembly.manifest);
    }
  }

  get(id: string): ProjectAssembly | null {
    return this.assemblies.get(id) ?? null;
  }

  getManifest(id: string): AssemblyManifest | null {
    return this.manifests.get(id) ?? null;
  }

  listIds(): string[] {
    return Array.from(this.assemblies.keys());
  }

  get size(): number {
    return this.assemblies.size;
  }
}

let _default: AssemblyRegistry | null = null;
export function getDefaultAssemblyRegistry(): AssemblyRegistry {
  if (!_default) _default = new AssemblyRegistry();
  return _default;
}
