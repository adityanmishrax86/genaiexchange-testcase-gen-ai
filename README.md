# AI Test Case Generator App 
#

# Deployment to Google Cloud Platform (GCP)

This project uses Google Cloud Build to automate deployment of both backend (Cloud Run) and frontend (Cloud Storage). See `cloudbuild.yaml` for build steps.

## Backend (Cloud Run)
1. Docker image is built and pushed to Google Container Registry.
2. Service is deployed to Cloud Run (region: `us-central1`).
3. The backend will be accessible at a URL like:
	 ```
	 https://genaiexchange-backend-<hash>-uc.a.run.app
	 ```
	 (Replace `<hash>` with your actual service hash, or check the Cloud Run console for the URL.)

## Frontend (Cloud Storage)
1. React app is built and deployed to a Google Cloud Storage bucket.
2. The bucket will be named:
	 ```
	 gs://$PROJECT_ID-genaiexchange-frontend
	 ```
3. The static site can be accessed via the bucket's public URL (if configured for public access).

### Demo Version
You can access the demo version here:

**[Demo Frontend](https://storage.googleapis.com/tcgen-ai-genaiexchange-frontend/index.html)**

## Accessing URLs
- **Backend API:** After deployment, get the backend URL from Cloud Run console or by running:
	```bash
	gcloud run services describe genaiexchange-backend --region us-central1 --format 'value(status.url)'
	```
- **Frontend:** If deployed to a public bucket, access via:
	```
	https://storage.googleapis.com/$PROJECT_ID-genaiexchange-frontend/index.html
	```
	Or use the demo link above.

For more details, see `cloudbuild.yaml` and individual service READMEs.
