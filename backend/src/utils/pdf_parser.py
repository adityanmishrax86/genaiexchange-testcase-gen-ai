import os
from typing import Optional
from dotenv import load_dotenv
from google.api_core.client_options import ClientOptions
from google.cloud import documentai_v1

load_dotenv()


def parse_pdf(
    file_path: str,
    project_id: Optional[str] = None,
    processor_id: Optional[str] = None,
    location: str = "us",
) -> str:
    """
    Parse a PDF document using Google Document AI OCR processor.
    
    Args:
        file_path: Path to the PDF file to process.
        project_id: GCP project ID. Defaults to PROJECT_ID env var.
        processor_id: Document AI processor ID. Defaults to PROCESSOR_ID env var.
        location: GCP region (e.g., "us", "eu"). Defaults to "us".
    
    Returns:
        Extracted text from the document.
    
    Raises:
        FileNotFoundError: If the file doesn't exist.
        ValueError: If project_id or processor_id are not provided or found.
    """
    # Use environment variables as defaults
    project_id = project_id or os.getenv("PROJECT_ID")
    processor_id = processor_id or os.getenv("PROCESSOR_ID")
    
    if not project_id or not processor_id:
        raise ValueError("project_id and processor_id must be provided or set in environment")
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    # Initialize client with regional endpoint
    opts = ClientOptions(api_endpoint=f"{location}-documentai.googleapis.com")
    client = documentai_v1.DocumentProcessorServiceClient(client_options=opts)
    
    # Build processor path and fetch processor metadata
    full_processor_name = client.processor_path(project_id, location, processor_id)
    request = documentai_v1.GetProcessorRequest(name=full_processor_name)
    processor = client.get_processor(request=request)
    
    # Read file and create raw document
    with open(file_path, "rb") as f:
        file_content = f.read()
    
    raw_document = documentai_v1.RawDocument(
        content=file_content,
        mime_type="application/pdf",
    )
    
    # Process document
    process_request = documentai_v1.ProcessRequest(
        name=processor.name,
        raw_document=raw_document,
    )
    result = client.process_document(process_request)
    
    return result.document.text


if __name__ == "__main__":
    file_path = "/home/prajna/personal-projects/genaiexchange-testcase-gen-ai/backend/input_docs/Premarket-Software-Functions-Guidance-29-45-1-15.pdf"
    
    try:
        extracted_text = parse_pdf(file_path)
        print("Extracted text:")
        print(extracted_text)
    except (FileNotFoundError, ValueError) as e:
        print(f"Error: {e}")