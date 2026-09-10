"""
Converts the real-world Wayanad (2024 Mundakkai/Chooralmala landslide zone)
elevation heightmap into the same {width, height, resolution, elevation[][],
obstacles[][], temperature[][]} grid shape the rest of AEGIS-NAV already
uses, so the Wayanad Digital Twin page and Backend 2's A*/D* Lite planners
work over it exactly like the synthetic terrain does.

wayanad_elevation.png is 476x460 RGBA, not the 100x100/256x256 the spec
assumed -- resampled to a fixed square GRID_SIZE grid since a real-world
raster's native pixel dimensions aren't the app's planning-grid resolution.

The source image itself turns out to be a hillshade / slope-relief render
(bright ridgelines catching simulated light, dark branching drainage
channels in shadow) rather than a raw smooth elevation surface -- visually
inspecting it shows the fine spidery ridge/valley texture characteristic of
that GIS rendering style, not a DEM. Read directly as height, that texture
becomes real per-cell noise (adjacent cells differing by up to ~20m out of
a 0-25m range), which renders as a spiky, un-cinematic mess rather than
terrain. A Gaussian blur at full resolution before downsampling removes
that fine hachure texture while preserving the large-scale ridge/valley
shape the hillshade is actually depicting -- if true elevation accuracy
matters later, swap this for a real DEM and drop the blur.

Elevation uses a LANCZOS resize (smooth interpolation suits a continuous
heightmap), but obstacles are computed from the FULL-resolution grayscale
first and then OR-pooled down (a target cell is blocked if ANY source pixel
under it was pure black) rather than resized directly -- a smoothing filter
would blur pure-black pixels into near-black ones and a naive nearest-
neighbor downsample could skip past a small black obstacle blob entirely
between sampled points.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

GRID_SIZE = 200
ELEVATION_MIN_M = 0.0
ELEVATION_MAX_M = 25.0
DEFAULT_TEMPERATURE_C = 25.0
ELEVATION_SMOOTHING_RADIUS_PX = 7.0

SCRIPT_DIR = Path(__file__).parent
SOURCE_IMAGE = SCRIPT_DIR / "wayanad_elevation.png"
OUTPUT_JSON = SCRIPT_DIR / "wayanad_grid.json"


def _or_pool_obstacles(mask: np.ndarray, grid_size: int) -> np.ndarray:
    h, w = mask.shape
    pad_h = (-h) % grid_size
    pad_w = (-w) % grid_size
    padded = np.pad(mask, ((0, pad_h), (0, pad_w)), mode="constant", constant_values=False)
    block_h = padded.shape[0] // grid_size
    block_w = padded.shape[1] // grid_size
    return padded.reshape(grid_size, block_h, grid_size, block_w).any(axis=(1, 3))


def main() -> None:
    grayscale = Image.open(SOURCE_IMAGE).convert("L")

    # Elevation: blur out the hillshade's fine ridge/valley hachure texture
    # (see module docstring) before the smooth resize down to the planning
    # grid.
    blurred = grayscale.filter(ImageFilter.GaussianBlur(radius=ELEVATION_SMOOTHING_RADIUS_PX))
    resized = blurred.resize((GRID_SIZE, GRID_SIZE), Image.LANCZOS)
    elevation = (np.array(resized).astype(np.float64) / 255.0) * (ELEVATION_MAX_M - ELEVATION_MIN_M) + ELEVATION_MIN_M
    elevation = np.round(elevation, 3)

    # Obstacles: hard-block pure black pixels (water/deep valleys), computed
    # at full resolution then pooled down -- see module docstring.
    full_res_mask = np.array(grayscale) == 0
    obstacles = _or_pool_obstacles(full_res_mask, GRID_SIZE)

    temperature = np.full((GRID_SIZE, GRID_SIZE), DEFAULT_TEMPERATURE_C)

    grid = {
        "width": GRID_SIZE,
        "height": GRID_SIZE,
        "resolution": 1.0,
        "elevation": elevation.tolist(),
        "obstacles": obstacles.tolist(),
        "temperature": temperature.tolist(),
    }

    OUTPUT_JSON.write_text(json.dumps(grid))

    obstacle_count = int(obstacles.sum())
    print(
        f"Wrote {OUTPUT_JSON} ({GRID_SIZE}x{GRID_SIZE}, "
        f"elevation {elevation.min():.1f}-{elevation.max():.1f}m, "
        f"{obstacle_count} obstacle cells)"
    )


if __name__ == "__main__":
    main()
