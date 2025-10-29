# this is a common class to parse documents of PDF, DOCX, CSV, XSLX, XML type
import os
import pandas as pd
from fastapi import HTTPException, status
from dotenv import load_dotenv
from src.utils.pdf_parser import parse_pdf

load_dotenv()




def extract_text_from_file(filepath: str) -> str:
    """
    Reads a file and extracts its text content based on its extension.
    Uses Google Document AI for PDFs, pandas for structured data, plain text for others.
    """
    text = ""
    try:
        if filepath.endswith(".pdf"):
            # Google Document AI OCR

            project_id = os.getenv("PROJECT_ID")
            processor_id = os.getenv("PROCESSOR_ID")
            location = os.getenv("LOCATION", "us")
            
            if not project_id or not processor_id:
                raise ValueError("PROJECT_ID and PROCESSOR_ID must be set in environment")
            
            text = parse_pdf(filepath, project_id, processor_id,location)
            
        elif filepath.endswith(".csv"):
            df = pd.read_csv(filepath)
            text = df.to_string()
            
        elif filepath.endswith(".xlsx"):
            df = pd.read_excel(filepath)
            text = df.to_string()
            
        else:  # Plain text
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
                
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to parse file {os.path.basename(filepath)}: {e}")
    
    return text