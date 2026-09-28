/**
 * Shared machine badge styling helper for SingleCalculator and ParallelPlanner.
 * Matches user's badge UI design across equipment columns and topology targets.
 */
export function getMachineBadgeClass(machine: string, isByproduct?: boolean): string {
  if (isByproduct) {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm';
  }
  switch (machine) {
    case '自動廚師機':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case '物質操縱機':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case '注入機':
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
    case '攪拌機':
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    case '收割機 (底料專供)':
      return 'bg-purple-900/40 text-purple-200 border-purple-500/40';
    default:
      return 'bg-slate-800 border-slate-700 text-slate-300';
  }
}
