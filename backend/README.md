# AI Test Case Gen Backend

This project reads the requirements and generates test cases based on the requirement documents.

## Features
- User will upload the requirements
- Then app will extract the required information and create a structed json
- based on the structred json confidence user can generate the test cases

## Setup
1. Clone the repo and create a Python virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
2. Set environment details accordingly in .env based on .env.example
3. Set Google ADC in local to authenticate with the GCP project
4. Enable Vertex AI API for the project 

## Usage
1. Once the setup is done, run `uvicorn app:app --reload`
2. Backend application is accessible on `http://localhost:8000`
