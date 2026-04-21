from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Literal


class UserImport(BaseModel):
    role: Literal["student", "faculty"]
    full_name: str
    username: str
    email: EmailStr
    password: str
    department: str
    program: str
    section: Optional[str] = None
    roll_no: Optional[str] = None
    employee_id: Optional[str] = None
    designation: Optional[str] = None
    subjects: Optional[str] = None
    semester: Optional[str] = None

    @field_validator("full_name", "department", "program")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field must not be empty")
        return v.strip().upper()

    @field_validator("username", "roll_no", "employee_id", mode="before")
    @classmethod
    def strip_str(cls, v):
        return v.strip() if isinstance(v, str) else v


class BulkImportRequest(BaseModel):
    users: List[UserImport]
    chunk_size: int = 100  # for reference/logging only; chunking happens client-side


class BulkImportResult(BaseModel):
    total: int
    inserted: int
    skipped: int
    failed: int
    errors: List[dict]


class BulkDeleteRequest(BaseModel):
    ids: Optional[List[str]] = None          # delete by username list
    department: Optional[str] = None         # delete entire dept
    role: Optional[Literal["student", "faculty"]] = None
    confirm: bool = False                    # safety flag — must be True


class BulkDeleteResult(BaseModel):
    deleted: int
    message: str
