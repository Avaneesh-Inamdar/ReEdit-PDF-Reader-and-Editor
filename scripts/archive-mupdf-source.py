"""Archive the exact MuPDF checkout and initialized submodules, preserving Git symlinks."""
import gzip
import pathlib
import subprocess
import sys
import tarfile

root = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2]).resolve()
expected = "20061bd45183f5a2bff8f43675e4da91e5ac2901"
actual = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
if actual != expected:
    raise SystemExit("Unexpected MuPDF source revision")
status = subprocess.check_output(["git", "-C", str(root), "submodule", "status", "--recursive"], text=True)
modules = []
for line in status.splitlines():
    if not line.startswith(" "):
        raise SystemExit("A MuPDF submodule is missing or has local changes")
    modules.append(line.split()[1])
with gzip.GzipFile(filename=str(destination), mode="wb", mtime=0) as compressed:
    with tarfile.open(fileobj=compressed, mode="w|") as archive:
        for relative in ["", *modules]:
            prefix = "mupdf-1.28.1/" + (relative + "/" if relative else "")
            process = subprocess.Popen(["git", "-C", str(root / relative), "archive", "--format=tar", "--prefix=" + prefix, "HEAD"], stdout=subprocess.PIPE)
            with tarfile.open(fileobj=process.stdout, mode="r|") as source:
                for member in source:
                    if member.pax_headers.get("comment"):
                        member.pax_headers.pop("comment")
                    archive.addfile(member, source.extractfile(member) if member.isfile() else None)
            # Git writes archive padding after the tar end marker; drain the pipe
            # before waiting so its writer cannot block on a full Windows pipe.
            process.stdout.read()
            if process.wait() != 0:
                raise SystemExit("Git source archive failed")
print(f"Archived MuPDF {actual} with {len(modules)} submodules: {destination.name}")
