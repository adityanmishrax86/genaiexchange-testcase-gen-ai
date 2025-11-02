"""Document parser for extracting text from multiple file formats.

Supports PDF (via Google Document AI), CSV, XLSX, and plain text files.
Gracefully handles malformed CSV files and falling back to raw text extraction.
"""
import logging
import os

import pandas as pd
from dotenv import load_dotenv
from fastapi import HTTPException, status

from src.utils.pdf_parser import parse_pdf

load_dotenv()

logger = logging.getLogger(__name__)


def _extract_csv_with_fallback(filepath: str) -> str:
    """Extract CSV data with fallback to raw text on parse errors.

    Tries multiple parsing strategies:
    1. Standard pandas CSV parsing
    2. Python engine with error tolerance
    3. Raw text extraction as last resort

    Args:
        filepath: Path to CSV file.

    Returns:
        Extracted text from CSV file.
    """
    try:
        # Try standard CSV parsing first
        df = pd.read_csv(filepath)
        logger.info("Successfully parsed CSV with standard parser")
        return df.to_string()

    except (pd.errors.ParserError, ValueError) as e:
        logger.warning(
            "Standard CSV parser failed (%s), trying Python engine",
            str(e),
        )

        try:
            # Try Python engine with error tolerance
            df = pd.read_csv(
                filepath,
                engine="python",
                on_bad_lines="skip",  # Skip malformed rows
                quoting=1,  # CSV.QUOTE_ALL for strict quoting
            )
            logger.info("Successfully parsed CSV with Python engine")
            return df.to_string()

        except (pd.errors.ParserError, ValueError) as e2:
            logger.warning(
                "Python engine also failed (%s), falling back to raw text",
                str(e2),
            )

            # Fallback: read as raw text
            try:
                with open(
                    filepath, "r", encoding="utf-8", errors="replace"
                ) as f:
                    text = f.read()
                logger.info("Extracted CSV as raw text")
                return text
            except Exception as e3:
                raise RuntimeError(
                    f"Failed to parse CSV file: {str(e3)}"
                ) from e3


def extract_text_from_file(filepath: str) -> str:
    """Extract text from file based on extension.

    Supports PDF (via Google Document AI), CSV, XLSX, and plain text.
    Gracefully handles malformed files with fallback to raw text extraction.

    Args:
        filepath: Full path to file to extract.

    Returns:
        Extracted text content.

    Raises:
        HTTPException: If file cannot be parsed.
    """
    text = ""
    try:
        if filepath.endswith(".pdf"):
            # Google Document AI OCR
            project_id = os.getenv("PROJECT_ID")
            processor_id = os.getenv("PROCESSOR_ID")
            location = os.getenv("LOCATION", "us")

            if not project_id or not processor_id:
                raise ValueError(
                    "PROJECT_ID and PROCESSOR_ID must be set in env"
                )

            text = parse_pdf(
                filepath, project_id, processor_id, location
            )
            logger.info("Successfully parsed PDF")

        elif filepath.endswith(".csv"):
            # CSV with robust error handling
            text = _extract_csv_with_fallback(filepath)

        elif filepath.endswith(".xlsx"):
            # Excel with error handling
            try:
                df = pd.read_excel(filepath)
                text = df.to_string()
                logger.info("Successfully parsed XLSX")
            except Exception as e:
                logger.warning(
                    "XLSX parsing failed (%s), extracting as raw text",
                    str(e),
                )
                with open(
                    filepath, "r", encoding="utf-8", errors="replace"
                ) as f:
                    text = f.read()

        else:
            # Plain text file
            with open(
                filepath, "r", encoding="utf-8", errors="replace"
            ) as f:
                text = f.read()
            logger.info("Extracted plain text file")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Failed to parse file %s: %s",
            os.path.basename(filepath),
            str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                f"Failed to parse file {os.path.basename(filepath)}: "
                f"{str(e)}"
            ),
        ) from e

    return text