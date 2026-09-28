import { SyncConfig } from '../types';
import { dataService } from './dataService';

export async function syncDataToGitHub(
  config: SyncConfig,
  commitMessage: string = 'feat(data): update Snacktorio game databases from web workbench'
): Promise<{ success: boolean; message: string }> {
  const { githubToken, repoOwner, repoName, branch = 'master' } = config;
  if (!githubToken || !repoOwner || !repoName) {
    return { success: false, message: '請先在設定中填寫 GitHub Token、使用者名稱與倉庫名稱。' };
  }

  const filesToCommit = [
    { path: 'src/data/machines.json', content: JSON.stringify(dataService.getMachines(), null, 2) },
    { path: 'src/data/items.json', content: JSON.stringify(dataService.getItems(), null, 2) },
    { path: 'src/data/intermediateRecipes.json', content: JSON.stringify(dataService.getIntermediateRecipes(), null, 2) },
    { path: 'src/data/recipes.json', content: JSON.stringify(dataService.getRecipes(), null, 2) },
    { path: 'src/data/calculatorDb.json', content: JSON.stringify(dataService.getCalculatorDb(), null, 2) },
  ];

  try {
    for (const file of filesToCommit) {
      const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${file.path}?ref=${branch}`;
      
      // 1. Get existing file sha if it exists
      let sha: string | undefined = undefined;
      const getRes = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (getRes.ok) {
        const fileInfo = await getRes.json();
        sha = fileInfo.sha;
      }

      // 2. Put file to commit
      const utf8Bytes = new TextEncoder().encode(file.content);
      let binaryStr = '';
      for (let i = 0; i < utf8Bytes.length; i++) {
        binaryStr += String.fromCharCode(utf8Bytes[i]);
      }
      const b64Content = btoa(binaryStr);

      const putRes = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `${commitMessage} (${file.path})`,
          content: b64Content,
          sha: sha,
          branch: branch
        })
      });

      if (!putRes.ok) {
        const errorData = await putRes.json();
        throw new Error(`上傳 ${file.path} 失敗: ${errorData.message || putRes.statusText}`);
      }
    }

    return { success: true, message: '🎉 所有資料已成功一鍵同步並 Commit 至 GitHub！' };
  } catch (err: any) {
    return { success: false, message: `同步失敗: ${err.message}` };
  }
}
