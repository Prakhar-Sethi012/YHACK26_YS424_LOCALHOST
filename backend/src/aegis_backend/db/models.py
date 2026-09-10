from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Mission(Base):
    __tablename__ = "missions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    started_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")

    incidents: Mapped[list["IncidentSOS"]] = relationship(back_populates="mission")


class IncidentSOS(Base):
    __tablename__ = "incidents_sos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id"))
    victim_id: Mapped[str] = mapped_column(String(64))
    x_coord: Mapped[float] = mapped_column(Float)
    y_coord: Mapped[float] = mapped_column(Float)
    ambient_temp: Mapped[float] = mapped_column(Float)
    structural_risk: Mapped[float] = mapped_column(Float)
    triage_status: Mapped[str] = mapped_column(String(32))
    timestamp: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))

    mission: Mapped[Mission] = relationship(back_populates="incidents")


class BenchmarkRun(Base):
    __tablename__ = "benchmark_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scenario_name: Mapped[str] = mapped_column(String(120))
    algorithm: Mapped[str] = mapped_column(String(32))  # "astar" | "dstar_lite"
    path_length: Mapped[float] = mapped_column(Float)
    total_energy_wh: Mapped[float] = mapped_column(Float)
    avg_latency_ms: Mapped[float] = mapped_column(Float)
    replans_count: Mapped[int] = mapped_column(Integer, default=0)
    collisions_avoided: Mapped[int] = mapped_column(Integer, default=0)
    recorded_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
