from setuptools import setup, find_packages

setup(
    name="nca-assistant",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "requests",
        "pydantic",
        "python-dotenv",
    ],
    python_requires=">=3.8",
) 