import type { MaterialRecipe } from "../tokenTypes.js";

type MaterialRecipeWithPriority = MaterialRecipe & {
  readonly priorityTokenRefs?: readonly string[];
};

/** Runtime-immutable declaration helper; capability resolution remains Gate 1C. */
export function defineMaterialRecipe<const T extends MaterialRecipeWithPriority>(recipe: T): T {
  return Object.freeze({
    ...recipe,
    surfaceTokens: Object.freeze([...recipe.surfaceTokens]),
    borderTokens: Object.freeze([...recipe.borderTokens]),
    typographyTokens: Object.freeze([...recipe.typographyTokens]),
    layoutTokens: Object.freeze([...recipe.layoutTokens]),
    protectedSemanticTokens: Object.freeze([...recipe.protectedSemanticTokens]),
    supportedCapabilities: Object.freeze([...recipe.supportedCapabilities]),
    fallbackRecipeIds: Object.freeze([...recipe.fallbackRecipeIds]),
    ...(recipe.priorityTokenRefs
      ? { priorityTokenRefs: Object.freeze([...recipe.priorityTokenRefs]) }
      : {}),
  }) as T;
}
