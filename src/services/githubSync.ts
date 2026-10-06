import { SyncConfig } from '../types';
import { dataService } from './dataService';

/**
 * 將核心資料庫（5 份 + 沙盒藍圖庫）以「單一原子 Commit」推送至 GitHub（Git Data API：ref → tree → commit → 更新 ref）。
 * 舊版逐檔 PUT /contents 會為每次存檔產生多筆 commit；此版本一次存檔僅 1 筆，且內容未變時不產生空 commit。
 */
export async function syncDataToGitHub(
  config: SyncConfig,
  commitMessage: string = 'feat(data): update Snacktorio game databases from web workbench'
): Promise<{ success: boolean; message: string }> {
  const { githubToken, repoOwner, repoName, branch = 'master' } = config;
  if (!githubToken || !repoOwner || !repoName) {
    return { success: false, message: '請先在設定中填寫 GitHub Token、使用者名稱與倉庫名稱。' };
  }

  // 本機無藍圖紀錄（從未開啟沙盒/新裝置）時不推送 sandboxBlueprints.json，避免以 [] 覆蓋倉庫內的官方藍圖
  let blueprintsContent: string | null = null;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('snacktorio_sandbox_blueprints_v1') : null;
    if (raw) {
      blueprintsContent = JSON.stringify(JSON.parse(raw), null, 2);
    }
  } catch {}

  const filesToCommit = [
    { path: 'src/data/machines.json', content: JSON.stringify(dataService.getMachines(), null, 2) },
    { path: 'src/data/items.json', content: JSON.stringify(dataService.getItems(), null, 2) },
    { path: 'src/data/intermediateRecipes.json', content: JSON.stringify(dataService.getIntermediateRecipes(), null, 2) },
    { path: 'src/data/recipes.json', content: JSON.stringify(dataService.getRecipes(), null, 2) },
    { path: 'src/data/calculatorDb.json', content: JSON.stringify(dataService.getCalculatorDb(), null, 2) },
    ...(blueprintsContent !== null ? [{ path: 'src/data/sandboxBlueprints.json', content: blueprintsContent }] : []),
  ];

  const api = `https://api.github.com/repos/${repoOwner}/${repoName}/git`;
  const request = async (path: string, method: string = 'GET', body?: unknown) => {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(`${method} ${path} 失敗: ${errorData.message || res.statusText}`);
    }
    return res.json();
  };

  try {
    // 1. 目前分支最新 commit 與其 tree
    const ref = await request(`/ref/heads/${branch}`);
    const parentSha: string = ref.object.sha;
    const parentCommit = await request(`/commits/${parentSha}`);

    // 2. 以 base_tree 疊加待推送檔案建立新 tree（content 直接帶 UTF-8 字串）
    const tree = await request('/trees', 'POST', {
      base_tree: parentCommit.tree.sha,
      tree: filesToCommit.map(f => ({ path: f.path, mode: '100644', type: 'blob', content: f.content }))
    });
    if (tree.sha === parentCommit.tree.sha) {
      return { success: true, message: '✅ 資料庫與 GitHub 上的版本完全相同，無需同步。' };
    }

    // 3. 建立單一 commit 並快轉分支
    const commit = await request('/commits', 'POST', {
      message: `${commitMessage}\n\n${filesToCommit.map(f => `- ${f.path}`).join('\n')}`,
      tree: tree.sha,
      parents: [parentSha]
    });
    await request(`/refs/heads/${branch}`, 'PATCH', { sha: commit.sha });

    return { success: true, message: '🎉 所有資料已成功一鍵同步並 Commit 至 GitHub！' };
  } catch (err: any) {
    return { success: false, message: `同步失敗: ${err.message}` };
  }
}
