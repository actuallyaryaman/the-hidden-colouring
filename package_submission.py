
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
ALLOWED = {'.py', '.md', '.html', '.css', '.js', '.mjs', '.json', '.csv', '.svg', '.ttf', '.txt'}
DEST = ROOT / 'hidden-colouring-source.zip'

if __name__ == '__main__':
    with ZipFile(DEST, 'w', ZIP_DEFLATED) as archive:
        for source in sorted(ROOT.rglob('*')):
            relative = source.relative_to(ROOT)
            if not source.is_file() or any(part.startswith('.') or part == '__pycache__' for part in relative.parts):
                continue
            if source.name == 'Makefile' or source.suffix in ALLOWED:
                archive.write(source, Path('zero-knowledge-lab') / relative)
    print(f'Source archive: {DEST} ({DEST.stat().st_size:,} bytes). No compiled executables included.')
