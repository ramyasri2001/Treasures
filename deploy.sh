#!/bin/zsh

# ==== config ====
BUCKET="lailas-website"

echo "Deploying Laila's Treasures to S3 bucket: $BUCKET"

# 1) Sync all files to S3 (except junk)
aws s3 sync . s3://$BUCKET \
  --delete \
  --exclude ".git/*" \
  --exclude "node_modules/*" \
  --exclude ".DS_Store" \
  --exclude "*.map"

# 2) Force fresh HTML so browser does not cache old pages
aws s3 cp s3://$BUCKET s3://$BUCKET --recursive \
  --exclude "*" --include "*.html" \
  --metadata-directive REPLACE \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

# 3) Light cache for JS/CSS

# 4) Show JS/CSS timestamps to confirm
echo "Latest JS/CSS in S3:"
aws s3 ls s3://$BUCKET/assets/js/
aws s3 ls s3://$BUCKET/assets/css/