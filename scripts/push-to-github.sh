#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-$(git branch --show-current)}"
DEFAULT_MESSAGE="Update ACS website"
COMMIT_MESSAGE="${1:-$DEFAULT_MESSAGE}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: run this script inside the project git repository."
  exit 1
fi

if [ -z "$BRANCH" ]; then
  echo "Error: could not detect the current branch."
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "Error: git remote '$REMOTE' does not exist."
  echo "Add it with: git remote add $REMOTE <your-github-repo-url>"
  exit 1
fi

echo "Remote: $REMOTE ($(git remote get-url "$REMOTE"))"
echo "Branch: $BRANCH"

echo
echo "Staging local changes..."
git add -A

if git diff --cached --quiet; then
  echo "No staged changes to commit."
else
  echo "Committing with message: $COMMIT_MESSAGE"
  git commit -m "$COMMIT_MESSAGE"
fi

echo
echo "Fetching latest changes from GitHub..."
git fetch "$REMOTE" "$BRANCH"

echo "Rebasing local branch on $REMOTE/$BRANCH..."
if ! git rebase "$REMOTE/$BRANCH"; then
  echo
  echo "Rebase stopped because of conflicts."
  echo "Fix the conflicted files, then run:"
  echo "  git add -A"
  echo "  git rebase --continue"
  echo "  git push $REMOTE $BRANCH"
  exit 1
fi

echo
echo "Pushing to GitHub..."
git push "$REMOTE" "$BRANCH"

echo
echo "Done. Your code is pushed to $REMOTE/$BRANCH."
