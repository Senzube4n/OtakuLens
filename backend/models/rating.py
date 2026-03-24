"""Rating model for chapter/series ratings."""

from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base, TimestampMixin


class Rating(Base, TimestampMixin):
    __tablename__ = "ratings"

    series_id: Mapped[str] = mapped_column(String(36), ForeignKey("series.id"))
    chapter_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("chapters.id"), nullable=True
    )
    user_name: Mapped[str] = mapped_column(String(100))
    score: Mapped[int] = mapped_column(Integer)  # 1-5
