"""Comment model for inline chapter comments."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base, TimestampMixin, generate_uuid, utc_now


class Comment(Base, TimestampMixin):
    __tablename__ = "comments"

    series_id: Mapped[str] = mapped_column(String(36), ForeignKey("series.id"))
    chapter_id: Mapped[str] = mapped_column(String(36), ForeignKey("chapters.id"))
    page_number: Mapped[int] = mapped_column(Integer)
    y_offset: Mapped[float] = mapped_column(Float)  # 0.0-1.0 relative position
    user_name: Mapped[str] = mapped_column(String(100), default="Anonymous")
    text: Mapped[str] = mapped_column(Text)
    reactions: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="{}")  # JSON dict of emoji -> count
