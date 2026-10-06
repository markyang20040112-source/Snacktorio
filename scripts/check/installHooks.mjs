// npm install 時自動執行（package.json 的 prepare）：讓 git 使用 .githooks/ 內的 pre-commit 品質閘門。
// 非 git 目錄或 CI 環境失敗時直接略過，不影響安裝。
import { execSync } from 'node:child_process';

try {
  execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
  console.log('[hooks] 已啟用 .githooks/pre-commit（提交前自動執行 npm run check）');
} catch {
  // 不是 git 工作區：略過
}
