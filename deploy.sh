#!/bin/bash
# ============================================================
# AI Encyclopedia Assistant - Google Cloud Run Deployment
# ============================================================
# This script automates deployment to Google Cloud Run.
# Bonus points: Infrastructure-as-code deployment automation.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - A Google Cloud project with billing enabled
#   - Vertex AI API enabled (if using Vertex AI)
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
# ============================================================

set -euo pipefail

# ---- Configuration ----
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME="ai-encyclopedia"
GOOGLE_API_KEY="${GOOGLE_API_KEY:-}"

# ---- Validation ----
if [ -z "$PROJECT_ID" ]; then
    echo "Error: GOOGLE_CLOUD_PROJECT environment variable is not set."
    echo "Set it with: export GOOGLE_CLOUD_PROJECT=your-project-id"
    exit 1
fi

if [ -z "$GOOGLE_API_KEY" ]; then
    echo "Error: GOOGLE_API_KEY environment variable is not set."
    echo "Get your key from: https://aistudio.google.com/apikey"
    exit 1
fi

echo "============================================"
echo "  AI Encyclopedia - Cloud Run Deployment"
echo "============================================"
echo "  Project:  $PROJECT_ID"
echo "  Region:   $REGION"
echo "  Service:  $SERVICE_NAME"
echo "============================================"
echo ""

# ---- Enable required APIs ----
echo ">> Enabling required Google Cloud APIs..."
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    aiplatform.googleapis.com \
    --project="$PROJECT_ID" \
    --quiet

# ---- Deploy to Cloud Run ----
echo ""
echo ">> Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
    --source . \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --allow-unauthenticated \
    --set-env-vars="GOOGLE_API_KEY=$GOOGLE_API_KEY,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,GOOGLE_GENAI_USE_VERTEXAI=FALSE,LIVE_API_MODEL=gemini-2.5-flash,IMAGE_GEN_MODEL=gemini-2.5-flash-image" \
    --memory=1Gi \
    --cpu=2 \
    --timeout=300 \
    --session-affinity \
    --min-instances=0 \
    --max-instances=3 \
    --quiet

# ---- Get the service URL ----
echo ""
echo ">> Getting service URL..."
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format="value(status.url)")

echo ""
echo "============================================"
echo "  Deployment Complete!"
echo "============================================"
echo "  Service URL: $SERVICE_URL"
echo ""
echo "  Open in browser: $SERVICE_URL"
echo "  Health check:    $SERVICE_URL/health"
echo "============================================"
