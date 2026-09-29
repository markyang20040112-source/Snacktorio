import os, sys, json, base64, urllib.request, urllib.error

REPO_OWNER = "markyang20040112-source"
REPO_NAME = "Snacktorio"
BRANCH = "main"

def api_request(url, token, method="GET", data=None):
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Snacktorio-Sync-Bot"
    }
    encoded_data = None
    if data is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
        encoded_data = json.dumps(data, ensure_ascii=False).encode("utf-8")
        
    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        raise RuntimeError(f"GitHub API Error [{e.code}]: {err_body}")

def push_updates(token: str, commit_msg: str):
    print(f"Connecting to GitHub: {REPO_OWNER}/{REPO_NAME} on branch '{BRANCH}'...")
    
    # 1. Get branch head commit
    branch_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/branches/{BRANCH}"
    branch_info = api_request(branch_url, token)
    head_commit_sha = branch_info["commit"]["sha"]
    base_tree_sha = branch_info["commit"]["commit"]["tree"]["sha"]
    print(f"Current HEAD commit: {head_commit_sha[:7]}, base tree: {base_tree_sha[:7]}")

    # 2. Gather files to push
    # We want to push:
    # - all files in public/icons/
    # - src/data/itemIcons.json
    # - src/types/index.ts
    # - src/utils/iconHelper.ts
    # - src/components/Common/ItemIcon.tsx
    # - src/components/Common/IconUploader.tsx
    # - src/components/Common/RecipeSearchSelect.tsx
    # - src/components/Common/SearchableSelect.tsx
    # - src/components/DataManager/ItemManager.tsx
    # - src/components/DataManager/IntermediateManager.tsx
    # - src/components/DataManager/MachineManager.tsx
    # - src/components/DataManager/RecipeManager.tsx
    # - src/components/Calculator/SingleCalculator.tsx
    # - src/components/ParallelPlanner/ParallelPlanner.tsx
    # - PROJECT_STATUS.md
    
    files_to_push = []
    
    # Icons
    icons_dir = os.path.join("public", "icons")
    if os.path.exists(icons_dir):
        for f in os.listdir(icons_dir):
            if f.endswith(".png"):
                files_to_push.append(os.path.join("public", "icons", f))
                
    # Code & Docs
    code_files = [
        "src/data/itemIcons.json",
        "src/types/index.ts",
        "src/utils/iconHelper.ts",
        "src/components/Common/ItemIcon.tsx",
        "src/components/Common/IconUploader.tsx",
        "src/components/Common/RecipeSearchSelect.tsx",
        "src/components/Common/SearchableSelect.tsx",
        "src/components/DataManager/ItemManager.tsx",
        "src/components/DataManager/IntermediateManager.tsx",
        "src/components/DataManager/MachineManager.tsx",
        "src/components/DataManager/RecipeManager.tsx",
        "src/components/Calculator/SingleCalculator.tsx",
        "src/components/ParallelPlanner/ParallelPlanner.tsx",
        "PROJECT_STATUS.md",
        "scripts/github_push.py"
    ]
    for cf in code_files:
        if os.path.exists(cf):
            files_to_push.append(cf)
            
    print(f"Total files to commit: {len(files_to_push)}")
    
    # 3. Create blobs
    tree_items = []
    for idx, filepath in enumerate(files_to_push, 1):
        rel_path = filepath.replace("\\", "/")
        print(f"[{idx}/{len(files_to_push)}] Uploading blob: {rel_path}...", end="\r")
        
        with open(filepath, "rb") as f:
            content_bytes = f.read()
            
        b64_content = base64.b64encode(content_bytes).decode("utf-8")
        blob_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/git/blobs"
        blob_res = api_request(blob_url, token, method="POST", data={
            "content": b64_content,
            "encoding": "base64"
        })
        
        tree_items.append({
            "path": rel_path,
            "mode": "100644",
            "type": "blob",
            "sha": blob_res["sha"]
        })
        
    print(f"\nAll {len(tree_items)} blobs uploaded successfully!")
    
    # 4. Create Tree
    print("Creating new Git Tree...")
    trees_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/git/trees"
    new_tree = api_request(trees_url, token, method="POST", data={
        "base_tree": base_tree_sha,
        "tree": tree_items
    })
    new_tree_sha = new_tree["sha"]
    print(f"New Tree SHA: {new_tree_sha}")

    # 5. Create Commit
    print(f"Creating commit: '{commit_msg}'...")
    commits_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/git/commits"
    new_commit = api_request(commits_url, token, method="POST", data={
        "message": commit_msg,
        "tree": new_tree_sha,
        "parents": [head_commit_sha]
    })
    new_commit_sha = new_commit["sha"]
    print(f"New Commit SHA: {new_commit_sha}")

    # 6. Update Branch Ref
    print(f"Updating branch '{BRANCH}' to point to {new_commit_sha[:7]}...")
    ref_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/git/refs/heads/{BRANCH}"
    api_request(ref_url, token, method="PATCH", data={
        "sha": new_commit_sha,
        "force": False
    })
    
    print("\n🎉 成功推送至 GitHub！GitHub Actions 將自動構建並發布至 GitHub Pages！")
    print(f"倉庫網址: https://github.com/{REPO_OWNER}/{REPO_NAME}")
    print("線上網站: https://markyang20040112-source.github.io/Snacktorio/")

if __name__ == "__main__":
    token = os.environ.get("GITHUB_TOKEN") or (sys.argv[1] if len(sys.argv) > 1 else None)
    if not token:
        print("Usage: python scripts/github_push.py <GITHUB_TOKEN> [COMMIT_MESSAGE]")
        print("Or set GITHUB_TOKEN environment variable.")
        sys.exit(1)
    msg = sys.argv[2] if len(sys.argv) > 2 else "feat(icons): add 162 native item icons, frame polish and item photo upload integration"
    push_updates(token, msg)
