#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-origin}"
BASE_BRANCH="$(git branch --show-current)"
BRANCH_PREFIX="${BRANCH_PREFIX:-mad}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BRANCH="$BRANCH_PREFIX/$TIMESTAMP"
DEFAULT_MESSAGE="Update ACS website"
COMMIT_MESSAGE="${1:-$DEFAULT_MESSAGE}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: run this script inside the project git repository."
  exit 1
fi

if [ -z "$BASE_BRANCH" ]; then
  echo "Error: could not detect the current branch."
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "Error: git remote '$REMOTE' does not exist."
  echo "Add it with: git remote add $REMOTE <your-github-repo-url>"
  exit 1
fi

echo "Remote: $REMOTE ($(git remote get-url "$REMOTE"))"
echo "Base branch: $BASE_BRANCH"

while git rev-parse --verify --quiet "$BRANCH" >/dev/null; do
  TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
  BRANCH="$BRANCH_PREFIX/$TIMESTAMP"
  sleep 1
done

echo "New branch: $BRANCH"

echo
echo "Creating unique branch..."
git switch -c "$BRANCH"

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
echo "Pushing to GitHub..."
git push -u "$REMOTE" "$BRANCH"

echo
echo "Done. Your code is pushed to $REMOTE/$BRANCH."
