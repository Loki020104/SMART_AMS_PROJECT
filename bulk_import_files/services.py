import asyncio
import hashlib
import logging
from typing import List

from db import supabase
from schemas import UserImport, BulkImportResult, BulkDeleteResult

logger = logging.getLogger(__name__)

CHUNK_SIZE = 100          # rows per Supabase upsert call
MAX_CONCURRENT = 5        # parallel upsert tasks
DELETE_BATCH_SIZE = 250   # IDs per DELETE IN clause


def hash_password(plain: str) -> str:
    """
    Replace with bcrypt in production:
        import bcrypt
        return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()
    """
    return hashlib.sha256(plain.encode()).hexdigest()


def build_row(user: UserImport) -> dict:
    return {
        "role": user.role,
        "full_name": user.full_name,
        "username": user.username,
        "email": user.email,
        "password_hash": hash_password(user.password),
        "department": user.department,
        "program": user.program,
        "section": user.section or "",
        "roll_no": user.roll_no or "",
        "employee_id": user.employee_id or "",
        "designation": user.designation or "",
        "subjects": user.subjects or "",
        "semester": user.semester or "",
    }


async def upsert_chunk(
    chunk: List[dict],
    errors: list,
    inserted_count: list,
    skipped_count: list,
) -> None:
    """
    Upsert one chunk into Supabase users table.
    on_conflict='username' — duplicate usernames are skipped (not overwritten).
    Switch to 'ignore_duplicates=False' to overwrite instead.
    """
    try:
        response = (
            supabase.table("users")
            .upsert(chunk, on_conflict="username", ignore_duplicates=True)
            .execute()
        )
        inserted = len(response.data) if response.data else 0
        skipped = len(chunk) - inserted
        inserted_count.append(inserted)
        skipped_count.append(skipped)
        logger.info(f"Chunk upserted — {inserted} inserted, {skipped} skipped")
    except Exception as e:
        logger.error(f"Chunk upsert failed: {e}")
        errors.append({"chunk_size": len(chunk), "error": str(e)})


async def bulk_import_users(users: List[UserImport]) -> BulkImportResult:
    rows = [build_row(u) for u in users]

    # Split into chunks
    chunks = [rows[i: i + CHUNK_SIZE] for i in range(0, len(rows), CHUNK_SIZE)]

    errors: list = []
    inserted_count: list = []
    skipped_count: list = []

    # Process chunks with bounded concurrency
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async def guarded_upsert(chunk):
        async with semaphore:
            await upsert_chunk(chunk, errors, inserted_count, skipped_count)

    await asyncio.gather(*[guarded_upsert(c) for c in chunks])

    total_inserted = sum(inserted_count)
    total_skipped = sum(skipped_count)
    total_failed = sum(e.get("chunk_size", 0) for e in errors)

    return BulkImportResult(
        total=len(rows),
        inserted=total_inserted,
        skipped=total_skipped,
        failed=total_failed,
        errors=errors,
    )


async def bulk_delete_users(
    ids: list | None,
    department: str | None,
    role: str | None,
) -> BulkDeleteResult:
    """
    Two modes:
      1. ids provided   → delete exactly those usernames in batches
      2. dept / role    → delete by filter (whole department or role)
    """
    deleted_total = 0

    if ids:
        # Batch deletes to avoid oversized IN clauses
        batches = [ids[i: i + DELETE_BATCH_SIZE] for i in range(0, len(ids), DELETE_BATCH_SIZE)]
        for batch in batches:
            try:
                resp = (
                    supabase.table("users")
                    .delete()
                    .in_("username", batch)
                    .execute()
                )
                deleted_total += len(resp.data) if resp.data else len(batch)
                logger.info(f"Deleted batch of {len(batch)} users")
            except Exception as e:
                logger.error(f"Delete batch failed: {e}")
    else:
        # Filter-based delete
        query = supabase.table("users").delete()
        if department:
            query = query.eq("department", department.upper())
        if role:
            query = query.eq("role", role)
        try:
            resp = query.execute()
            deleted_total = len(resp.data) if resp.data else 0
            logger.info(f"Filter delete — {deleted_total} users removed")
        except Exception as e:
            logger.error(f"Filter delete failed: {e}")

    return BulkDeleteResult(
        deleted=deleted_total,
        message=f"{deleted_total} users deleted successfully",
    )
