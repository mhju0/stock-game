from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.auth import hash_password, verify_password, create_access_token
from app.services.auth_rate_limit import (
    LOGIN_GLOBAL_LIMIT,
    LOGIN_IDENTITY_LIMIT,
    LOGIN_WINDOW_SECONDS,
    REGISTER_GLOBAL_LIMIT,
    REGISTER_IDENTITY_LIMIT,
    REGISTER_WINDOW_SECONDS,
    enforce_auth_rate_limit,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes")
        if not any(character.isalpha() for character in value):
            raise ValueError("Password must contain a letter")
        if not any(character.isdigit() for character in value):
            raise ValueError("Password must contain a number")
        return value


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_bcrypt_input_length(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes")
        return value


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    enforce_auth_rate_limit(
        "register",
        body.username,
        identity_limit=REGISTER_IDENTITY_LIMIT,
        global_limit=REGISTER_GLOBAL_LIMIT,
        window_seconds=REGISTER_WINDOW_SECONDS,
    )
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    user = User(username=body.username, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.username)
    return {"access_token": token, "token_type": "bearer", "user_id": user.id, "username": user.username}


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    enforce_auth_rate_limit(
        "login",
        body.username,
        identity_limit=LOGIN_IDENTITY_LIMIT,
        global_limit=LOGIN_GLOBAL_LIMIT,
        window_seconds=LOGIN_WINDOW_SECONDS,
    )
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token(user.id, user.username)
    return {"access_token": token, "token_type": "bearer", "user_id": user.id, "username": user.username}
