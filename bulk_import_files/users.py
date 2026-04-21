import io
import csv
import logging

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse

from schemas import (
    BulkImportRequest, BulkImportResult,
    BulkDeleteRequest, BulkDeleteResult,
    UserImport,
)
from services import bulk_import_users, bulk_delete_users

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_IMPORT_ROWS = 5000   # hard cap per request


# ──────────────────────────────────────────────
# POST /api/users/bulk-import
# Accepts pre-parsed JSON body (from frontend chunking)
# ──────────────────────────────────────────────
@router.post("/bulk-import", response_model=BulkImportResult)
async def bulk_import_json(payload: BulkImportRequest):
    if not payload.users:
        raise HTTPException(status_code=400, detail="No users provided")

    if len(payload.users) > MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=413,
            detail=f"Too many rows. Max {MAX_IMPORT_ROWS} per request."
        )

    logger.info(f"Bulk import started — {len(payload.users)} users")
    result = await bulk_import_users(payload.users)
    logger.info(f"Bulk import done — {result.inserted} inserted, {result.failed} failed")
    return result


# ──────────────────────────────────────────────
# POST /api/users/bulk-import/csv
# Accepts raw CSV file upload — parses server-side
# ──────────────────────────────────────────────
@router.post("/bulk-import/csv", response_model=BulkImportResult)
async def bulk_import_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = await file.read()
    text = content.decode("utf-8-sig")   # handle BOM from Excel exports
    reader = csv.DictReader(io.StringIO(text))

    users = []
    parse_errors = []

    for i, row in enumerate(reader, start=2):   # row 1 = header
        try:
            # Strip whitespace from all values
            clean = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
            # Skip empty rows
            if not any(clean.values()):
                continue
            users.append(UserImport(**clean))
        except Exception as e:
            parse_errors.append({"row": i, "error": str(e)})

    if not users:
        return BulkImportResult(
            total=0, inserted=0, skipped=0,
            failed=len(parse_errors), errors=parse_errors
        )

    if len(users) > MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=413,
            detail=f"CSV has {len(users)} rows. Max is {MAX_IMPORT_ROWS}."
        )

    result = await bulk_import_users(users)
    result.errors = parse_errors + result.errors
    result.failed += len(parse_errors)
    return result


# ──────────────────────────────────────────────
# DELETE /api/users/bulk-delete
# Deletes by username list OR by dept/role filter
# ──────────────────────────────────────────────
@router.delete("/bulk-delete", response_model=BulkDeleteResult)
async def bulk_delete(payload: BulkDeleteRequest):
    if not payload.confirm:
        raise HTTPException(
            status_code=400,
            detail="Set confirm=true to proceed with deletion"
        )

    has_ids = payload.ids and len(payload.ids) > 0
    has_filter = payload.department or payload.role

    if not has_ids and not has_filter:
        raise HTTPException(
            status_code=400,
            detail="Provide either 'ids' list or at least one filter (department/role)"
        )

    logger.warning(
        f"Bulk delete triggered — ids={len(payload.ids or [])} "
        f"dept={payload.department} role={payload.role}"
    )

    result = await bulk_delete_users(
        ids=payload.ids,
        department=payload.department,
        role=payload.role,
    )
    return result


# ──────────────────────────────────────────────
# GET /api/users/bulk-delete/preview
# Dry-run: returns count of users that WOULD be deleted
# ──────────────────────────────────────────────
@router.get("/bulk-delete/preview")
async def bulk_delete_preview(
    department: str | None = Query(None),
    role: str | None = Query(None),
):
    from db import supabase
    query = supabase.table("users").select("username", count="exact")
    if department:
        query = query.eq("department", department.upper())
    if role:
        query = query.eq("role", role)
    resp = query.execute()
    return {
        "would_delete": resp.count or 0,
        "filters": {"department": department, "role": role},
    }
