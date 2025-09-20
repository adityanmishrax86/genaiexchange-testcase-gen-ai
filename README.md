# AI Test Case Generator App 
## Developed for Hack2Skill/Google Gen AI Exchange Hackathon 

An AI based test generator tool which extracts the analyzes requirements and extracts, then based on QA Enginner's approval it can be moved to generate cases. Again QA Engineer can review and make the changes or re-generate the test cases. Once the cases are generated and it is approved by the engineer it can be moved to export it as csv and push the test case to JIRA. With traceablity matrix engineer can trace the generation and analysis of the requirements briefly.

## Tech Stack Used
1. Frontend - React and Vite to create seamless components create great UI and UX designs.
2. Backend - Fast API to handle the ainteraction with AI and DB. SQLite to store the running session details and track tracebility.
3. Vertex AI - Google Cloud Vertex AI Models to interact with with AI to anaylze requirements and generate test cases.
4. GCP - Google Cloud run to host the backend, Google Cloud Storage to host the static frontend and Google Cloud Build to automate the deployment seamless to GCP cloud suite.

## Integration
1. Gemini Model - Currently using 'gemini-2.5-flash-lite' model.
2. JIRA - Jira APIS to push the test cases to JIRA

### Notes
1. For JIRA integration currently personal JIRA account is used with personal email address(hard-coded)
2. Please reach out to us for the API key and access to Demo JIRA project Url.
3. TO upload records to test go to [/backend/input_docs](https://github.com/adityanmishrax86/genaiexchange-testcase-gen-ai/tree/master/backend/input_docs) to upload the requirement


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

TO upload records to test go to [/backend/input_docs](https://github.com/adityanmishrax86/genaiexchange-testcase-gen-ai/tree/master/backend/input_docs) to upload the requirement

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
