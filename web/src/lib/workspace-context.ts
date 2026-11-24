export interface WorkspaceBranch {
  id: string;
}

export function hasSingleWorkspaceBranch(
  branches: readonly WorkspaceBranch[],
): boolean {
  return branches.length === 1 && branches[0].id.trim().length > 0;
}
