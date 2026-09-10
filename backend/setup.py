from pybind11.setup_helpers import Pybind11Extension, build_ext
from setuptools import find_packages, setup

ext_modules = [
    Pybind11Extension(
        "aegis_core",
        sources=[
            "src/bindings.cpp",
            "src/core/grid2d.cpp",
            "src/core/astar.cpp",
            "src/core/dstar_lite.cpp",
        ],
        include_dirs=["src"],
        cxx_std=17,
    ),
]

setup(
    name="aegis-nav-backend",
    version="0.1.0",
    packages=find_packages(where="src", include=["aegis_backend*"]),
    package_dir={"": "src"},
    ext_modules=ext_modules,
    cmdclass={"build_ext": build_ext},
    zip_safe=False,
)
