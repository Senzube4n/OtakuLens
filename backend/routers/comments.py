"""Comments and ratings router for inline chapter comments."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.comment import Comment
from backend.models.rating import Rating
from backend.models import Chapter

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Schemas ---

class CommentCreate(BaseModel):
    page_number: int
    y_offset: float = Field(ge=0.0, le=1.0)
    text: str = Field(min_length=1, max_length=2000)
    user_name: str = Field(default="Anonymous", max_length=100)


class CommentResponse(BaseModel):
    id: str
    series_id: str
    chapter_id: str
    page_number: int
    y_offset: float
    user_name: str
    text: str
    reactions: dict[str, int]
    created_at: str

    @classmethod
    def from_model(cls, comment: Comment) -> "CommentResponse":
        try:
            reactions = json.loads(comment.reactions or "{}")
        except (json.JSONDecodeError, TypeError):
            reactions = {}
        return cls(
            id=comment.id,
            series_id=comment.series_id,
            chapter_id=comment.chapter_id,
            page_number=comment.page_number,
            y_offset=comment.y_offset,
            user_name=comment.user_name,
            text=comment.text,
            reactions=reactions,
            created_at=comment.created_at.isoformat(),
        )


class ReactionCreate(BaseModel):
    emoji: str = Field(max_length=10)


class RatingCreate(BaseModel):
    score: int = Field(ge=1, le=5)
    user_name: str = Field(default="Anonymous", max_length=100)


class RatingResponse(BaseModel):
    average: float
    count: int


# --- Comment Endpoints ---

@router.get(
    "/chapters/{chapter_id}/comments",
    response_model=list[CommentResponse],
)
async def list_comments(chapter_id: str, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    stmt = (
        select(Comment)
        .where(Comment.chapter_id == chapter_id)
        .order_by(Comment.page_number, Comment.y_offset)
    )
    result = await db.execute(stmt)
    comments = result.scalars().all()
    return [CommentResponse.from_model(c) for c in comments]


@router.post(
    "/chapters/{chapter_id}/comments",
    response_model=CommentResponse,
    status_code=201,
)
async def create_comment(
    chapter_id: str,
    body: CommentCreate,
    db: AsyncSession = Depends(get_db),
):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    comment = Comment(
        series_id=chapter.series_id,
        chapter_id=chapter_id,
        page_number=body.page_number,
        y_offset=body.y_offset,
        user_name=body.user_name or "Anonymous",
        text=body.text,
        reactions="{}",
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
    return CommentResponse.from_model(comment)


@router.post(
    "/comments/{comment_id}/react",
    response_model=CommentResponse,
)
async def react_to_comment(
    comment_id: str,
    body: ReactionCreate,
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    ALLOWED_EMOJIS = {"\U0001f525", "\U0001f4af", "\U0001f62d", "\u2764\ufe0f", "\U0001f602"}
    if body.emoji not in ALLOWED_EMOJIS:
        raise HTTPException(status_code=400, detail="Emoji not allowed")

    try:
        reactions = json.loads(comment.reactions or "{}")
    except (json.JSONDecodeError, TypeError):
        reactions = {}

    reactions[body.emoji] = reactions.get(body.emoji, 0) + 1
    comment.reactions = json.dumps(reactions)
    await db.flush()
    await db.refresh(comment)
    return CommentResponse.from_model(comment)


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(comment_id: str, db: AsyncSession = Depends(get_db)):
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    await db.delete(comment)


# --- Rating Endpoints ---

@router.post(
    "/chapters/{chapter_id}/rate",
    response_model=RatingResponse,
)
async def rate_chapter(
    chapter_id: str,
    body: RatingCreate,
    db: AsyncSession = Depends(get_db),
):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    # Upsert: one rating per user per chapter
    stmt = select(Rating).where(
        Rating.chapter_id == chapter_id,
        Rating.user_name == body.user_name,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.score = body.score
    else:
        rating = Rating(
            series_id=chapter.series_id,
            chapter_id=chapter_id,
            user_name=body.user_name,
            score=body.score,
        )
        db.add(rating)

    await db.flush()

    # Return updated average
    avg_stmt = select(
        func.avg(Rating.score), func.count(Rating.id)
    ).where(Rating.chapter_id == chapter_id)
    avg_result = await db.execute(avg_stmt)
    row = avg_result.one()
    return RatingResponse(average=round(float(row[0] or 0), 1), count=int(row[1]))


@router.get(
    "/series/{series_id}/ratings",
    response_model=RatingResponse,
)
async def get_series_ratings(series_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(
        func.avg(Rating.score), func.count(Rating.id)
    ).where(Rating.series_id == series_id)
    result = await db.execute(stmt)
    row = result.one()
    return RatingResponse(average=round(float(row[0] or 0), 1), count=int(row[1]))
