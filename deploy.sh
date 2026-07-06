#!/bin/bash
# 本番デプロイ: docs/ を Cloudflare Pages (bubble-ring.pages.dev) に公開する
set -e
cd "$(dirname "$0")"
npx wrangler pages deploy docs --project-name bubble-ring --branch main --commit-dirty=true
